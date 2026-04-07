import request from 'supertest';
import { createApp } from '../../../app';
import { signToken } from '../../../shared/auth/jwt';

describe('PUT /api/reports/:id', () => {
  const app = createApp();
  let editorToken: string;
  let adminToken: string;
  let reportId: string;
  let version: number;

  beforeAll(async () => {
    editorToken = signToken({ userId: '2', email: 'editor@example.com', role: 'editor' });
    adminToken = signToken({ userId: '3', email: 'admin@example.com', role: 'admin' });
    const createRes = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ title: 'Update Test', description: 'initial' });
    reportId = createRes.body.id;
    version = createRes.body.metadata.version;
  });

  it('updates with matching ETag and returns new ETag', async () => {
    const res = await request(app)
      .put(`/api/reports/${reportId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .set('If-Match', `"${version}"`)
      .send({ title: 'Updated Title' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
    expect(res.body.metadata.version).toBe(version + 1);
    expect(res.headers.etag).toBeDefined();
  });

  it('returns 403 when editor updates published report', async () => {
    // Publish with admin
    const currentVersion = (await request(app)
      .get(`/api/reports/${reportId}`)
      .set('Authorization', `Bearer ${editorToken}`)).body.metadata.version;
    await request(app)
      .put(`/api/reports/${reportId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('If-Match', `"${currentVersion}"`)
      .send({ status: 'published', justification: 'Approved' });
    // Editor tries to update
    const newVersion = currentVersion + 1;
    const res = await request(app)
      .put(`/api/reports/${reportId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .set('If-Match', `"${newVersion}"`)
      .send({ title: 'Hacked' });
    expect(res.status).toBe(403);
  });
});