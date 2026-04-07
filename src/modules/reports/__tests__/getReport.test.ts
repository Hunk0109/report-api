import request from 'supertest';
import { createApp } from '../../../app';
import { signToken } from '../../../shared/auth/jwt';

describe('GET /api/reports/:id', () => {
  const app = createApp();
  let editorToken: string;
  let reportId: string;

  beforeAll(async () => {
    editorToken = signToken({ userId: '2', email: 'editor@example.com', role: 'editor' });
    const createRes = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ title: 'Test Report', description: 'test', priority: 'medium' });
    reportId = createRes.body.id;
  });

  it('returns rich view with metrics and pagination', async () => {
    const res = await request(app)
      .get(`/api/reports/${reportId}?view=rich&page=1&size=5`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(200);
    expect(res.headers.etag).toBeDefined();
    expect(res.body.metrics).toBeDefined();
    expect(res.body.pagination).toBeDefined();
    expect(res.body.entries).toBeDefined();
  });

  it('returns compact view', async () => {
    const res = await request(app)
      .get(`/api/reports/${reportId}?view=compact`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(reportId);
    expect(res.body.entries).toBeUndefined();
    expect(res.body.metrics).toBeDefined();
  });

  it('supports field inclusion', async () => {
    const res = await request(app)
      .get(`/api/reports/${reportId}?include=metrics`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.metrics).toBeDefined();
    expect(res.body.entries).toBeUndefined();
  });
});