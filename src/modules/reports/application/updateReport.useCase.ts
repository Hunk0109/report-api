import type { IReportRepository } from '../../../core/ports/repositories/IReportRepository';
import type { IQueue } from '../../../core/ports/services/IQueue';
import type { ILogger } from '../../../core/ports/ILogger';
import { DomainError } from '../../../core/errors/DomainError';
import { Report } from '../../../core/domain/entities/Report';

export interface UpdateReportCommand {
  id: string;
  body: {
    title?: string;
    description?: string;
    status?: 'draft' | 'published' | 'archived';
    priority?: 'low' | 'medium' | 'high';
    tags?: string[];
    justification?: string;
  };
  expectedVersion: number;
  userId: string;
  role: 'reader' | 'editor' | 'admin';
}

export interface UpdateReportResult {
  report: Report;
}

export class UpdateReportUseCase {
  constructor(
    private readonly repo: IReportRepository,
    private readonly queue: IQueue,
    private readonly logger: ILogger
  ) {}

  async execute(cmd: UpdateReportCommand): Promise<UpdateReportResult> {
    const report = await this.repo.findById(cmd.id);
    if (!report) {
      throw new DomainError('NOT_FOUND', 'Report not found');
    }

    // Optimistic concurrency check
    if (report.metadata.version !== cmd.expectedVersion) {
      throw new DomainError('CONFLICT', `Version mismatch. Expected ${cmd.expectedVersion}, got ${report.metadata.version}`);
    }

    // Custom business rule: published reports require admin + justification
    if (report.status === 'published') {
      if (cmd.role !== 'admin') {
        throw new DomainError('FORBIDDEN', 'Only administrators can update published reports');
      }
      if (!cmd.body.justification || cmd.body.justification.trim().length < 5) {
        throw new DomainError('VALIDATION', 'Justification (min 5 characters) required for updating published reports', {
          field: 'justification'
        });
      }
    }

    // Apply partial updates
    if (cmd.body.title !== undefined) report.title = cmd.body.title;
    if (cmd.body.description !== undefined) report.description = cmd.body.description;
    if (cmd.body.status !== undefined) report.status = cmd.body.status;
    if (cmd.body.priority !== undefined) report.priority = cmd.body.priority;
    if (cmd.body.tags !== undefined) report.tags = cmd.body.tags;

    // Increment version and update timestamp
    report.metadata.version += 1;
    report.updatedAt = new Date().toISOString();

    await this.repo.update(report);

    // Async side effects – use allowed payload structure (only reportId)
    await this.queue.enqueue({
      type: 'report.updated',
      payload: { reportId: report.id }
    });

    this.logger.info('updateReport.success', { reportId: report.id, userId: cmd.userId });
    return { report };
  }
}