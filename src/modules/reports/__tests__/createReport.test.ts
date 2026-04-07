import request from 'supertest';
import { createApp } from '../../../app';
import { signToken } from '../../../shared/auth/jwt';

describe('POST /api/reports', () => {
  const app = createApp();
  let editorToken: string;

  beforeAll(() => {
    editorToken = signToken({ userId: '2', email: 'editor@example.com', role: 'editor' });
  });

  it('creates a report and returns 201 with Location', async () => {
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({
        title: 'Q1 Revenue',
        description: 'Quarterly report',
        priority: 'high',
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('Q1 Revenue');
    expect(res.body.metadata.version).toBe(1);
    expect(res.headers.location).toBe(`/api/reports/${res.body.id}`);
  });

  it('returns 403 for reader role', async () => {
    const readerToken = signToken({ userId: '1', email: 'reader@example.com', role: 'reader' });
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ title: 'Forbidden', description: 'test' });
    expect(res.status).toBe(403);
  });
});