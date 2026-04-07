import type { Priority } from '../value-objects/Priority';

export interface EntryProps {
  id: string;
  title: string;
  content: string;
  priority: Priority;
  createdAt: string;
  updatedAt: string;
}

export class Entry {
  readonly id: string;
  title: string;
  content: string;
  priority: Priority;
  readonly createdAt: string;
  updatedAt: string;

  constructor(props: EntryProps) {
    this.id = props.id;
    this.title = props.title;
    this.content = props.content;
    this.priority = props.priority;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  touch(nowIso: string): void {
    this.updatedAt = nowIso;
  }
}
