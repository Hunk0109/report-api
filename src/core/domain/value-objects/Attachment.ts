// src/core/domain/value-objects/Attachment.ts
export interface Attachment {
  id: string;
  originalName: string;
  storedFileName: string;
  sizeBytes: number;
  relativePath: string;
  uploadedAt: string;
  mimeType: string;
}