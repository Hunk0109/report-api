import type { IQueue } from '../../core/ports/services/IQueue';
import type { DomainJobPayload } from '../../core/domain/events/DomainEvents';
import type { ILogger } from '../../core/ports/ILogger';
import { appConfig } from '../../config';

export interface DeadLetterItem {
  job: DomainJobPayload;
  attempts: number;
  lastError: string;
  failedAt: string;
}

export class MemoryQueue implements IQueue {
  private readonly logger: ILogger;
  private readonly failureRate: number;
  private readonly deadLetter: DeadLetterItem[] = [];

  constructor(logger: ILogger, failureRate?: number) {
    this.logger = logger;
    this.failureRate = failureRate ?? appConfig.queueFailureRate;
  }

  async enqueue(job: DomainJobPayload): Promise<void> {
    void this.processWithRetries(job, 0);
  }

  getDeadLetter(): readonly DeadLetterItem[] {
    return this.deadLetter;
  }

  private async processWithRetries(job: DomainJobPayload, attempt: number): Promise<void> {
    const maxRetries = 3;
    try {
      await this.simulateWork(job);
      this.logger.info('queue.job.success', { jobType: job.type, attempt });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn('queue.job.failure', {
        jobType: job.type,
        attempt,
        error: message
      });
      if (attempt < maxRetries - 1) {
        const delayMs = 2 ** attempt * 1000;
        this.logger.info('queue.job.retry', { jobType: job.type, attempt: attempt + 1, delayMs });
        await sleep(delayMs);
        await this.processWithRetries(job, attempt + 1);
      } else {
        const failedAt = new Date().toISOString();
        this.deadLetter.push({
          job,
          attempts: maxRetries,
          lastError: message,
          failedAt
        });
        this.logger.error('queue.job.dead_letter', {
          jobType: job.type,
          attempts: maxRetries,
          lastError: message,
          failedAt
        });
      }
    }
  }

  private async simulateWork(job: DomainJobPayload): Promise<void> {
    await sleep(5);
    if (Math.random() < this.failureRate) {
      throw new Error(`Simulated failure for ${job.type}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
