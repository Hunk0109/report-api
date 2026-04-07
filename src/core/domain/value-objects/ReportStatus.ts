export const REPORT_STATUSES = ['draft', 'published', 'archived'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export function isReportStatus(value: string): value is ReportStatus {
  return (REPORT_STATUSES as readonly string[]).includes(value);
}
