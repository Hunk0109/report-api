import type { DomainJobPayload } from '../../domain/events/DomainEvents';

export interface IQueue {
  enqueue(job: DomainJobPayload): Promise<void>;
}
