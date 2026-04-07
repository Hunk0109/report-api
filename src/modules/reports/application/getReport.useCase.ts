import type { IReportRepository } from '../../../core/ports/repositories/IReportRepository';
import type { Report } from '../../../core/domain/entities/Report';
import { DomainError } from '../../../core/errors/DomainError';
export interface GetReportCommand {
  id: string;
}

export class GetReportUseCase {
  constructor(private readonly repo: IReportRepository) {}

  async execute(cmd: GetReportCommand): Promise<Report> {
    const report = await this.repo.findById(cmd.id);
    if (!report) {
      throw new DomainError('NOT_FOUND', 'Report not found');
    }
    report.incrementViewCount();
    await this.repo.update(report);
    return report;
  }
}
