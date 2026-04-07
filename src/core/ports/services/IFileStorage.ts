export interface IFileStorage {
  upload(params: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
  }): Promise<{
    id: string;
    originalName: string;
    storedFileName: string;
    sizeBytes: number;
    relativePath: string;
  }>;

  getSignedUrl(params: {
    fileId: string;
    expiresInSeconds: number;
  }): Promise<string>;

  verifySignedDownloadRequest(params: {
    fileId: string;
    expiry: string;
    signature: string;
  }): boolean;

  streamFile(fileId: string): Promise<{
    stream: NodeJS.ReadableStream;
    mimeType: string;
    originalName: string;
    sizeBytes: number;
  } | null>;
}