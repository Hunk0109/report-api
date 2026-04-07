import request from 'supertest';
import { createApp } from '../../../app';
import { signToken } from '../../../shared/auth/jwt';

describe('PUT /api/reports optimistic concurrency', () => {
  const app = createApp();
  const editorToken = signToken({
    userId: '2',
    email: 'editor@example.com',
    role: 'editor'
  });

  it('returns 409 conflict when If-Match contains stale version', async () => {
    const createRes = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({
        title: `Concurrency-${Date.now()}`,
        description: 'initial'
      });

    expect(createRes.status).toBe(201);
    const reportId = createRes.body.id as string;
    const createdVersion = createRes.body.metadata.version as number;

    const successUpdate = await request(app)
      .put(`/api/reports/${reportId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .set('If-Match', `"${createdVersion}"`)
      .send({ description: 'first update' });

    expect(successUpdate.status).toBe(200);
    const latestVersion = successUpdate.body.metadata.version as number;
    expect(latestVersion).toBe(createdVersion + 1);

    const staleUpdate = await request(app)
      .put(`/api/reports/${reportId}`)
      .set('Authorization', `Bearer ${editorToken}`)
      .set('If-Match', `"${createdVersion}"`)
      .send({ description: 'stale update' });

    expect(staleUpdate.status).toBe(409);
    expect(staleUpdate.body.error).toBe('CONFLICT');
    expect(String(staleUpdate.body.message)).toContain('Version mismatch');
  });
});
