// src/modules/reports/infrastructure/mappers/ReportMapper.ts
import { Report } from '../../../../core/domain/entities/Report';

export interface ReportPresentationQuery {
  view: 'rich' | 'compact';
  include?: string;
  page: number;
  size: number;
  sortBy: 'createdAt' | 'priority' | 'title';
  sortOrder: 'asc' | 'desc';
  filter?: Record<string, unknown>;
}

export interface ReportResponseDTO {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  ownerId: string;
  entries?: any[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  metadata: {
    version: number;
    viewCount: number;
    [key: string]: any;
  };
  metrics?: {
    totalEntries: number;
    avgEntryPriority: number;
    highPriorityCount: number;
    trendIndicator: string;
    lastActivityAt: string;
  };
  pagination?: {
    page: number;
    size: number;
    total: number;
    totalPages: number;
  };
}

export type ReportResponseShape = ReportResponseDTO;

export class ReportMapper {
  static toHttpResponse(
    report: Report,
    query: ReportPresentationQuery,
    options?: { includeAllMetadataKeys?: boolean }
  ): ReportResponseDTO {
    // Base response
    const response: ReportResponseDTO = {
      id: report.id,
      title: report.title,
      description: report.description,
      status: report.status,
      priority: report.priority,
      ownerId: report.ownerId,
      tags: report.tags,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      metadata: options?.includeAllMetadataKeys
        ? report.metadata
        : {
            version: report.metadata.version,
            viewCount: report.metadata.viewCount,
          },
    };

    // Handle entries pagination, sorting, filtering
    let entries = [...report.entries];
    if (query.filter && typeof query.filter === 'object' && 'priority' in query.filter) {
      const filterPriority = query.filter.priority as string;
      entries = entries.filter(e => e.priority === filterPriority);
    }
    // Sorting
    if (query.sortBy === 'priority') {
      const priorityOrder: Record<string, number> = { low: 1, medium: 2, high: 3 };
      entries.sort((a, b) =>
        query.sortOrder === 'asc'
          ? priorityOrder[a.priority] - priorityOrder[b.priority]
          : priorityOrder[b.priority] - priorityOrder[a.priority]
      );
    } else if (query.sortBy === 'title') {
      entries.sort((a, b) =>
        query.sortOrder === 'asc'
          ? a.title.localeCompare(b.title)
          : b.title.localeCompare(a.title)
      );
    } else {
      entries.sort((a, b) =>
        query.sortOrder === 'asc'
          ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    const totalEntries = entries.length;
    const start = (query.page - 1) * query.size;
    const paginatedEntries = entries.slice(start, start + query.size);

    // Compute metrics
    const priorityScores: Record<string, number> = { low: 1, medium: 2, high: 3 };
    const avgPriority =
      entries.length === 0
        ? 0
        : entries.reduce((sum, e) => sum + priorityScores[e.priority], 0) / entries.length;

    const metrics = {
      totalEntries,
      avgEntryPriority: avgPriority,
      highPriorityCount: entries.filter(e => e.priority === 'high').length,
      trendIndicator: report.metadata.viewCount > 100 ? 'high_engagement' : 'normal',
      lastActivityAt: report.updatedAt,
    };

    const entriesResponse = paginatedEntries.map(e => ({
      id: e.id,
      title: e.title,
      content: e.content,
      priority: e.priority,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));

    if (query.view === 'compact') {
      return {
        id: response.id,
        title: response.title,
        description: response.description,
        status: response.status,
        priority: response.priority,
        ownerId: response.ownerId,
        tags: response.tags,
        createdAt: response.createdAt,
        updatedAt: response.updatedAt,
        metadata: response.metadata,
        metrics,
      };
    }

    response.entries = entriesResponse;
    response.metrics = metrics;
    response.pagination = {
      page: query.page,
      size: query.size,
      total: totalEntries,
      totalPages: Math.ceil(totalEntries / query.size),
    };

    if (query.include) {
      const includeSet = new Set(query.include.split(','));
      const filtered: any = {};
      if (includeSet.has('entries')) filtered.entries = response.entries;
      if (includeSet.has('metrics')) filtered.metrics = response.metrics;
      if (includeSet.has('pagination')) filtered.pagination = response.pagination;
      filtered.id = response.id;
      filtered.title = response.title;
      filtered.description = response.description;
      filtered.status = response.status;
      filtered.priority = response.priority;
      filtered.ownerId = response.ownerId;
      filtered.tags = response.tags;
      filtered.createdAt = response.createdAt;
      filtered.updatedAt = response.updatedAt;
      filtered.metadata = response.metadata;
      return filtered as ReportResponseDTO;
    }

    return response;
  }
}