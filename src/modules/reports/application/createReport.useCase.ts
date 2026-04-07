import { v4 as uuidv4 } from 'uuid';
import { Report } from '../../../core/domain/entities/Report';
import type { IReportRepository } from '../../../core/ports/repositories/IReportRepository';
import type { IQueue } from '../../../core/ports/services/IQueue';
import type { ILogger } from '../../../core/ports/ILogger';
import { DomainError } from '../../../core/errors/DomainError';

export interface CreateReportCommand {
  input: {
    title: string;
    description: string;
    priority?: 'low' | 'medium' | 'high';
    tags?: string[];
    metadata?: Record<string, any>;
  };
  ownerId: string;
  // ownerRole is NOT passed to Report entity, but you may store it elsewhere if needed
}

export interface CreateReportResult {
  report: Report;
}

export class CreateReportUseCase {
  constructor(
    private readonly repo: IReportRepository,
    private readonly queue: IQueue,
    private readonly logger: ILogger
  ) {}

  async execute(cmd: CreateReportCommand): Promise<CreateReportResult> {
    const now = new Date().toISOString();
    const duplicate = await this.repo.findByTitle(cmd.input.title);
    if (duplicate) {
      throw new DomainError('CONFLICT', 'A report with this title already exists', {
        field: 'title'
      });
    }

    const reportId = uuidv4();

    const report = new Report({
      id: reportId,
      title: cmd.input.title,
      description: cmd.input.description,
      status: 'draft',
      priority: cmd.input.priority || 'medium',
      ownerId: cmd.ownerId,
      // ownerRole removed from here
      entries: [],
      tags: cmd.input.tags || [],
      createdAt: now,
      updatedAt: now,
      metadata: {
        version: 1,
        viewCount: 0,
        attachments: [],
        extra: cmd.input.metadata || {}
      }
    });

    await this.repo.save(report);

    await this.queue.enqueue({
      type: 'report.created',
      payload: {
        reportId: report.id,
        title: report.title,
        ownerId: report.ownerId
      }
    });
    await this.queue.enqueue({
      type: 'cache.invalidate',
      payload: { reportId: report.id }
    });

    this.logger.info('createReport.success', { reportId: report.id });
    return { report };
  }
}