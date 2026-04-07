// src/modules/reports/application/uploadAttachment.useCase.ts
import type { IReportRepository } from '../../../core/ports/repositories/IReportRepository';
import type { IFileStorage } from '../../../core/ports/services/IFileStorage';
import type { ILogger } from '../../../core/ports/ILogger';
import { DomainError } from '../../../core/errors/DomainError';
import { appConfig } from '../../../config';
import type { Attachment } from '../../../core/domain/value-objects/Attachment';

export interface UploadAttachmentCommand {
  reportId: string;
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

export interface UploadAttachmentResult {
  fileId: string;
  originalName: string;
  sizeBytes: number;
  signedUrl: string;
}

export class UploadAttachmentUseCase {
  constructor(
    private readonly repo: IReportRepository,
    private readonly storage: IFileStorage,
    private readonly logger: ILogger
  ) {}

  async execute(cmd: UploadAttachmentCommand): Promise<UploadAttachmentResult> {
    const report = await this.repo.findById(cmd.reportId);
    if (!report) {
      throw new DomainError('NOT_FOUND', 'Report not found');
    }

    // Upload to storage – returns { id, originalName, storedFileName, sizeBytes, relativePath }
    const stored = await this.storage.upload({
      buffer: cmd.buffer,
      originalName: cmd.originalName,
      mimeType: cmd.mimeType,
    });

    // Generate signed URL (await the Promise)
    const signedUrl = await this.storage.getSignedUrl({
      fileId: stored.id,
      expiresInSeconds: appConfig.signedUrlExpiry,
    });

    // Build attachment object matching the Attachment interface
    const attachment: Attachment = {
      id: stored.id,
      originalName: stored.originalName,
      storedFileName: stored.storedFileName,
      sizeBytes: stored.sizeBytes,
      relativePath: stored.relativePath,
      uploadedAt: new Date().toISOString(),
      mimeType: cmd.mimeType,
    };

    // Add to report metadata
    if (!report.metadata.attachments) {
      report.metadata.attachments = [];
    }
    report.metadata.attachments.push(attachment);
    report.updatedAt = new Date().toISOString();
    await this.repo.update(report);

    this.logger.info('uploadAttachment.success', { reportId: cmd.reportId, fileId: stored.id });
    return {
      fileId: stored.id,
      originalName: stored.originalName,
      sizeBytes: stored.sizeBytes,
      signedUrl,
    };
  }
}