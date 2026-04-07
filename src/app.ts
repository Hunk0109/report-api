import express from 'express';
import fs from 'fs';
import path from 'path';
import { appConfig } from './config';
import { WinstonLogger } from './shared/logging/winstonLogger';
import { MemoryQueue } from './shared/queue/memoryQueue';
import { LocalFileStorage } from './shared/fileStorage/localFileStorage';
import { InMemoryReportRepository } from './modules/reports/infrastructure/repositories/InMemoryReportRepository';
import { CreateReportUseCase } from './modules/reports/application/createReport.useCase';
import { GetReportUseCase } from './modules/reports/application/getReport.useCase';
import { UpdateReportUseCase } from './modules/reports/application/updateReport.useCase';
import { UploadAttachmentUseCase } from './modules/reports/application/uploadAttachment.useCase';
import { createReportController } from './modules/reports/interfaces/reportController';
import { createReportRouter } from './modules/reports/interfaces/reportRoutes';
import { requestIdMiddleware } from './shared/middleware/requestId';
import { createHttpsEnforcementMiddleware } from './shared/middleware/httpsEnforcement';
import { createLoggerMiddleware } from './shared/middleware/loggerMiddleware';
import { apiRateLimiter } from './shared/middleware/rateLimiter';
import { authenticateJwt, authorizeReportsAccess } from './shared/middleware/authMiddleware';
import { errorHandler } from './shared/middleware/errorHandler';
import { signToken } from './shared/auth/jwt';
import { authTokenSchema } from './modules/reports/infrastructure/validation/reportSchemas';
import { HARDCODED_USERS } from './shared/auth/users';

function ensureDirs(): void {
  fs.mkdirSync(appConfig.uploadDir, { recursive: true });
  fs.mkdirSync(path.resolve('./logs'), { recursive: true });
}

export function createApp(): express.Express {
  ensureDirs();

  const logger = new WinstonLogger();
  const queue = new MemoryQueue(logger, appConfig.queueFailureRate);
  const storage = new LocalFileStorage(appConfig.uploadDir);
  const reportRepository = new InMemoryReportRepository();

  const createReport = new CreateReportUseCase(reportRepository, queue, logger);
  const getReport = new GetReportUseCase(reportRepository);
  const updateReport = new UpdateReportUseCase(reportRepository, queue, logger);
  const uploadAttachment = new UploadAttachmentUseCase(reportRepository, storage, logger);

  const controller = createReportController({
    createReport,
    getReport,
    updateReport,
    uploadAttachment,
    reportRepository
  });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestIdMiddleware);
  app.use(
    createHttpsEnforcementMiddleware({
      enabled: appConfig.enforceHttps && appConfig.nodeEnv !== 'test'
    })
  );
  app.use(apiRateLimiter);
  app.use(express.json({ limit: '1mb' }));
  app.use(createLoggerMiddleware(logger));

  app.post('/auth/token', (req, res, next) => {
    try {
      const body = authTokenSchema.parse(req.body);
      const user = HARDCODED_USERS[body.userId];
      const token = signToken({
        userId: user.id,
        email: user.email,
        role: user.role
      });
      res.status(200).json({
        accessToken: token,
        expiresIn: appConfig.jwtExpiresIn,
        tokenType: 'Bearer'
      });
    } catch (e) {
      next(e);
    }
  });

  app.get('/attachments/:fileId/download', (req, res, next) => {
    void (async () => {
      try {
        const fileId = req.params.fileId;
        const expiry = String(req.query.expiry ?? '');
        const signature = String(req.query.signature ?? '');
        const ok = storage.verifySignedDownloadRequest({ fileId, expiry, signature });
        if (!ok) {
          res.status(401).json({
            error: 'UNAUTHORIZED',
            message: 'Invalid or expired download link',
            statusCode: 401,
            timestamp: new Date().toISOString(),
            requestId: (req as any).requestId
          });
          return;
        }
        const result = await storage.streamFile(fileId);
        if (!result) {
          res.status(404).json({
            error: 'NOT_FOUND',
            message: 'File not found',
            statusCode: 404,
            timestamp: new Date().toISOString(),
            requestId: (req as any).requestId
          });
          return;
        }
        logger.info('attachment.download', { fileId, requestId: (req as any).requestId });
        res.setHeader('Content-Type', result.mimeType);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(result.originalName)}"`
        );
        res.setHeader('Content-Length', String(result.sizeBytes));
        result.stream.pipe(res);
      } catch (e) {
        next(e);
      }
    })();
  });

  const reportsRouter = createReportRouter(controller);
  app.use('/api/reports', authenticateJwt, authorizeReportsAccess, reportsRouter);

  app.use(errorHandler(logger));

  return app;
}

const app = createApp();
export default app;

if (require.main === module) {
  app.listen(appConfig.port, () => {
    process.stdout.write(`Report API listening on port ${appConfig.port}\n`);
  });
}
