import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { appConfig } from '../../config';
import type { IFileStorage } from '../../core/ports/services/IFileStorage';

export class LocalFileStorage implements IFileStorage {
  constructor(private readonly uploadDir: string) {}

  async upload(params: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
  }): Promise<{
    id: string;
    originalName: string;
    storedFileName: string;
    sizeBytes: number;
    relativePath: string;
  }> {
    const fileId = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(params.originalName);
    const storedFileName = `upload-${fileId}${ext}`;
    const filePath = path.join(this.uploadDir, storedFileName);
    fs.writeFileSync(filePath, params.buffer);
    return {
      id: fileId,
      originalName: params.originalName,
      storedFileName,
      sizeBytes: params.buffer.length,
      relativePath: filePath,
    };
  }

  async getSignedUrl(params: {
    fileId: string;
    expiresInSeconds: number;
  }): Promise<string> {
    const expiry = Math.floor(Date.now() / 1000) + params.expiresInSeconds;
    const signature = crypto
      .createHmac('sha256', appConfig.jwtSecret)
      .update(`${params.fileId}:${expiry}`)
      .digest('hex')
      .substring(0, 32);
    return `/attachments/${params.fileId}/download?expiry=${expiry}&signature=${signature}`;
  }

  verifySignedDownloadRequest(params: {
    fileId: string;
    expiry: string;
    signature: string;
  }): boolean {
    const expiryNum = parseInt(params.expiry);
    if (isNaN(expiryNum) || expiryNum < Date.now() / 1000) {
      return false;
    }
    const expected = crypto
      .createHmac('sha256', appConfig.jwtSecret)
      .update(`${params.fileId}:${params.expiry}`)
      .digest('hex')
      .substring(0, 32);
    return crypto.timingSafeEqual(Buffer.from(params.signature), Buffer.from(expected));
  }

  async streamFile(fileId: string): Promise<{
    stream: NodeJS.ReadableStream;
    mimeType: string;
    originalName: string;
    sizeBytes: number;
  } | null> {
    // Find the file – in a real implementation you'd store metadata mapping.
    // For simplicity, scan the uploads folder.
    const files = fs.readdirSync(this.uploadDir);
    const storedFileName = files.find(f => f.includes(fileId));
    if (!storedFileName) return null;
    const filePath = path.join(this.uploadDir, storedFileName);
    const stats = fs.statSync(filePath);
    const stream = fs.createReadStream(filePath);
    // You would need to store original name separately. For demo, assume the stored file name includes it.
    return {
      stream,
      mimeType: 'application/octet-stream', // ideally you'd store this
      originalName: storedFileName,
      sizeBytes: stats.size,
    };
  }
}