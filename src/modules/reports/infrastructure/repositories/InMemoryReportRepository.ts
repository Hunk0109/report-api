import { v4 as uuidv4 } from 'uuid';
import type {
  AuditLogRecord,
  IdempotencyRecord,
  IReportRepository
} from '../../../../core/ports/repositories/IReportRepository';
import type { Report } from '../../../../core/domain/entities/Report';

export class InMemoryReportRepository implements IReportRepository {
  private readonly reports = new Map<string, Report>();
  private readonly titleIndex = new Map<string, string>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly audits: AuditLogRecord[] = [];

  async save(report: Report): Promise<void> {
    this.reports.set(report.id, report);
    this.titleIndex.set(report.title.toLowerCase(), report.id);
  }

  async findById(id: string): Promise<Report | null> {
    return this.reports.get(id) ?? null;
  }

  async findAll(): Promise<Report[]> {
    return [...this.reports.values()];
  }

  async findByTitle(title: string): Promise<Report | null> {
    const id = this.titleIndex.get(title.toLowerCase());
    if (!id) {
      return null;
    }
    return this.reports.get(id) ?? null;
  }

  async update(report: Report): Promise<void> {
    const existing = this.reports.get(report.id);
    if (existing && existing.title !== report.title) {
      this.titleIndex.delete(existing.title.toLowerCase());
      this.titleIndex.set(report.title.toLowerCase(), report.id);
    }
    this.reports.set(report.id, report);
  }

  async delete(id: string): Promise<void> {
    const existing = this.reports.get(id);
    if (existing) {
      this.titleIndex.delete(existing.title.toLowerCase());
    }
    this.reports.delete(id);
  }

  async saveIdempotency(record: IdempotencyRecord): Promise<void> {
    this.idempotency.set(record.key, record);
  }

  async getIdempotency(key: string): Promise<IdempotencyRecord | null> {
    return this.idempotency.get(key) ?? null;
  }

  async appendAudit(record: AuditLogRecord): Promise<void> {
    this.audits.push(record);
  }

  /** Exposed for tests / diagnostics */
  getAudits(): readonly AuditLogRecord[] {
    return this.audits;
  }

  /** Replace idempotency entry for testing */
  clearIdempotency(): void {
    this.idempotency.clear();
  }

  generateAuditId(): string {
    return uuidv4();
  }
}
