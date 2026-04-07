import request from 'supertest';
import { createApp } from '../../../app';
import { signToken } from '../../../shared/auth/jwt';

describe('POST /api/reports idempotency', () => {
  const app = createApp();
  const editorToken = signToken({
    userId: '2',
    email: 'editor@example.com',
    role: 'editor'
  });

  it('replays previous response when Idempotency-Key is reused', async () => {
    const key = `idem-${Date.now()}`;
    const firstPayload = {
      title: `Idempotent-${Date.now()}`,
      description: 'first payload'
    };

    const first = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${editorToken}`)
      .set('Idempotency-Key', key)
      .send(firstPayload);

    expect(first.status).toBe(201);
    expect(first.body.idempotent).toBe(false);
    expect(first.body.id).toBeDefined();

    const second = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${editorToken}`)
      .set('Idempotency-Key', key)
      .send({
        title: 'SHOULD-NOT-BE-CREATED',
        description: 'second payload'
      });

    expect(second.status).toBe(200);
    expect(second.body.idempotent).toBe(true);
    expect(second.body.id).toBe(first.body.id);
    expect(second.body.title).toBe(first.body.title);
  });
});
