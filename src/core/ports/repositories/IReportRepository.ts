import type { Report } from '../../domain/entities/Report';

export interface AuditLogRecord {
  id: string;
  reportId: string;
  userId: string;
  timestamp: string;
  before: unknown;
  after: unknown;
}

export interface IdempotencyRecord {
  key: string;
  reportId: string;
  responseBody: unknown;
  statusCode: number;
  createdAtMs: number;
}

export interface IReportRepository {
  save(report: Report): Promise<void>;
  findById(id: string): Promise<Report | null>;
  findAll(): Promise<Report[]>;
  findByTitle(title: string): Promise<Report | null>;
  update(report: Report): Promise<void>;
  delete(id: string): Promise<void>;
  saveIdempotency(record: IdempotencyRecord): Promise<void>;
  getIdempotency(key: string): Promise<IdempotencyRecord | null>;
  appendAudit(record: AuditLogRecord): Promise<void>;
}
