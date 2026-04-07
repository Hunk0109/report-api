import type { Request, Response, NextFunction } from 'express';
import { CreateReportUseCase } from '../application/createReport.useCase';
import { GetReportUseCase } from '../application/getReport.useCase';
import { UpdateReportUseCase } from '../application/updateReport.useCase';
import { UploadAttachmentUseCase } from '../application/uploadAttachment.useCase';
import {
  createReportSchema,
  getReportQuerySchema,
  updateReportSchema
} from '../infrastructure/validation/reportSchemas';
import { ReportMapper, type ReportPresentationQuery } from '../infrastructure/mappers/ReportMapper';
import type { InMemoryReportRepository } from '../infrastructure/repositories/InMemoryReportRepository';
import { DomainError } from '../../../core/errors/DomainError';
import { appConfig } from '../../../config';

export interface ReportControllerDeps {
  createReport: CreateReportUseCase;
  getReport: GetReportUseCase;
  updateReport: UpdateReportUseCase;
  uploadAttachment: UploadAttachmentUseCase;
  reportRepository: InMemoryReportRepository;
}

function parseIfMatchVersion(header: string | undefined): number | null {
  if (!header || header.trim() === '') {
    return null;
  }
  const raw = header.trim().replace(/^W\//i, '').replaceAll('"', '');
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function routeParamId(req: Request, key: string): string {
  const v = req.params[key];
  if (Array.isArray(v)) {
    return v[0] ?? '';
  }
  return v ?? '';
}

function parseFilterJson(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw || raw.trim() === '') {
    return undefined;
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new DomainError('VALIDATION', 'Invalid JSON for filter', { field: 'filter' });
  }
}

export function createReportController(deps: ReportControllerDeps) {
  const {
    createReport,
    getReport,
    updateReport,
    uploadAttachment,
    reportRepository
  } = deps;

  return {
    create: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
        if (idempotencyKey) {
          const existing = await reportRepository.getIdempotency(idempotencyKey);
          if (existing && Date.now() - existing.createdAtMs < appConfig.idempotencyTtlMs) {
            res.status(200).json({
              ...(existing.responseBody as object),
              idempotent: true
            });
            return;
          }
        }

        const body = createReportSchema.parse(req.body);
        const result = await createReport.execute({
          input: body,
          ownerId: (req as any).user.id
        });

        const query = getReportQuerySchema.parse({
          view: 'rich',
          include: 'entries,metrics',
          page: 1,
          size: 100
        });
        const presentation: ReportPresentationQuery = {
          ...query,
          filter: undefined
        };
        const payload = ReportMapper.toHttpResponse(result.report, presentation, {
          includeAllMetadataKeys: true
        });
        const responseBody = { ...payload, idempotent: false };

        if (idempotencyKey) {
          await reportRepository.saveIdempotency({
            key: idempotencyKey,
            reportId: result.report.id,
            responseBody,
            statusCode: 201,
            createdAtMs: Date.now()
          });
        }

        res.status(201).location(`/api/reports/${result.report.id}`).json(responseBody);
      } catch (e) {
        next(e);
      }
    },

    getById: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const query = getReportQuerySchema.parse(req.query);
        const filter = parseFilterJson(query.filter);
        const presentation: ReportPresentationQuery = { ...query, filter };
        const report = await getReport.execute({ id: routeParamId(req, 'id') });
        const payload = ReportMapper.toHttpResponse(report, presentation, {
          includeAllMetadataKeys: true
        });
        res.setHeader('ETag', String(report.metadata.version));
        res.status(200).json(payload);
      } catch (e) {
        next(e);
      }
    },

    update: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const expectedVersion = parseIfMatchVersion(req.headers['if-match']);
        if (expectedVersion === null) {
          res.status(400).json({
            error: 'VALIDATION',
            message: 'If-Match header with current version is required',
            statusCode: 400,
            timestamp: new Date().toISOString(),
            requestId: (req as any).requestId,
            field: 'If-Match'
          });
          return;
        }

        const body = updateReportSchema.parse(req.body);
        const existing = await reportRepository.findById(routeParamId(req, 'id'));
        if (!existing) {
          next(new DomainError('NOT_FOUND', 'Report not found'));
          return;
        }

        if (existing.status === 'published' && (req as any).user?.role !== 'admin') {
          res.status(403).json({
            error: 'FORBIDDEN',
            message: 'Only administrators may update published reports',
            statusCode: 403,
            timestamp: new Date().toISOString(),
            requestId: (req as any).requestId,
            field: 'status'
          });
          return;
        }

        if (existing.status === 'published' && (req as any).user?.role === 'admin') {
          const j = body.justification;
          if (!j || j.trim().length < 5) {
            res.status(422).json({
              error: 'UNPROCESSABLE_ENTITY',
              message: 'Justification is required (min 5 characters) when updating a published report',
              statusCode: 422,
              timestamp: new Date().toISOString(),
              requestId: (req as any).requestId,
              field: 'justification'
            });
            return;
          }
        }

        const updated = await updateReport.execute({
          id: routeParamId(req, 'id'),
          body,
          expectedVersion,
          userId: (req as any).user?.id ?? 'unknown',
          role: (req as any).user?.role ?? 'reader'
        });

        const query = getReportQuerySchema.parse({
          view: 'rich',
          include: 'entries,metrics',
          page: 1,
          size: 100
        });
        const presentation: ReportPresentationQuery = { ...query, filter: undefined };
        const payload = ReportMapper.toHttpResponse(updated.report, presentation, {
          includeAllMetadataKeys: true
        });
        res.setHeader('ETag', String(updated.report.metadata.version));
        res.status(200).json(payload);
      } catch (e) {
        next(e);
      }
    },

    upload: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const file = req.file;
        if (!file) {
          next(
            new DomainError('VALIDATION', 'Multipart field "file" is required', {
              field: 'file'
            })
          );
          return;
        }
        if (!appConfig.allowedFileTypes.includes(file.mimetype)) {
          next(
            new DomainError('VALIDATION', 'File type not allowed', { field: 'file' })
          );
          return;
        }
        const result = await uploadAttachment.execute({
          reportId: routeParamId(req, 'id'),
          buffer: file.buffer,
          originalName: file.originalname,
          mimeType: file.mimetype
        });
        res.status(201).json({
          fileId: result.fileId,
          originalName: result.originalName,
          size: result.sizeBytes,
          signedUrl: result.signedUrl
        });
      } catch (e) {
        next(e);
      }
    }
  };
}

export type ReportController = ReturnType<typeof createReportController>;