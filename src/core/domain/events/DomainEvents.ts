export type ReportCreatedPayload = {
  reportId: string;
  title: string;
  ownerId: string;
};

export type DomainJobPayload = 
  | { type: 'report.created'; payload: { reportId: string; title: string; ownerId: string } }
  | { type: 'report.updated'; payload: { reportId: string } }
  | { type: 'cache.invalidate'; payload: { reportId: string } };
