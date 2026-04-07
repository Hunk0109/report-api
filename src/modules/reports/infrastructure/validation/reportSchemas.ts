import { z } from 'zod';

export const createReportSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  tags: z.array(z.string()).max(20).optional(),
  metadata: z.object({
    department: z.string().optional(),
    region: z.string().optional(),
  }).optional(),
});

export const updateReportSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  tags: z.array(z.string()).max(20).optional(),
  justification: z.string().min(5).optional(),
});

export const getReportQuerySchema = z.object({
  view: z.enum(['rich', 'compact']).default('rich'),
  include: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  size: z.coerce.number().int().positive().max(100).default(10),
  sortBy: z.enum(['createdAt', 'priority', 'title']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  filter: z.string().optional(),
});

export const authTokenSchema = z.object({
  userId: z.enum(['user-reader', 'user-editor', 'user-admin']),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type UpdateReportInput = z.infer<typeof updateReportSchema>;
export type GetReportQuery = z.infer<typeof getReportQuerySchema>;