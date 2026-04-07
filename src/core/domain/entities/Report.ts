import { Entry } from './Entry';
import type { Attachment } from '../value-objects/Attachment';
import type { Priority } from '../value-objects/Priority';
import type { ReportStatus } from '../value-objects/ReportStatus';

export interface ReportMetadata {
  version: number;
  viewCount: number;
  attachments: Attachment[];
  extra: Record<string, unknown>;
}

export interface ReportProps {
  id: string;
  title: string;
  description: string;
  status: ReportStatus;
  priority: Priority;
  ownerId: string;
  entries: Entry[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  metadata: ReportMetadata;
}

export class Report {
  readonly id: string;
  title: string;
  description: string;
  status: ReportStatus;
  priority: Priority;
  ownerId: string;
  entries: Entry[];
  tags: string[];
  readonly createdAt: string;
  updatedAt: string;
  metadata: ReportMetadata;

  constructor(props: ReportProps) {
    this.id = props.id;
    this.title = props.title;
    this.description = props.description;
    this.status = props.status;
    this.priority = props.priority;
    this.ownerId = props.ownerId;
    this.entries = props.entries;
    this.tags = props.tags;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.metadata = props.metadata;
  }

  bumpVersion(nowIso: string): void {
    this.metadata = {
      ...this.metadata,
      version: this.metadata.version + 1
    };
    this.updatedAt = nowIso;
  }

  incrementViewCount(): void {
    this.metadata = {
      ...this.metadata,
      viewCount: this.metadata.viewCount + 1
    };
  }
}
