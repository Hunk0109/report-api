import request from 'supertest';
import { createApp } from '../../../app';
import { signToken } from '../../../shared/auth/jwt';

describe('POST /api/reports/:id/attachment', () => {
  const app = createApp();
  let editorToken: string;
  let reportId: string;

  beforeAll(async () => {
    editorToken = signToken({ userId: '2', email: 'editor@example.com', role: 'editor' });
    const createRes = await request(app)
      .post('/api/reports')
      .set('Authorization', `Bearer ${editorToken}`)
      .send({ title: 'File Upload Test', description: 'test' });
    reportId = createRes.body.id;
  });

  it('uploads a file and returns signed URL', async () => {
    const fileContent = Buffer.from('Hello, this is a test file');
    const res = await request(app)
      .post(`/api/reports/${reportId}/attachment`)
      .set('Authorization', `Bearer ${editorToken}`)
      .attach('file', fileContent, 'test.txt');
    expect(res.status).toBe(201);
    expect(res.body.fileId).toBeDefined();
    expect(res.body.originalName).toBe('test.txt');
    expect(res.body.size).toBe(fileContent.length);
    expect(res.body.signedUrl).toMatch(/^\/attachments\/[a-f0-9]+\/download\?expiry=\d+&signature=[a-f0-9]+$/);
  });

  it('returns 401 when download signature is invalid (tampered expiry)', async () => {
    const uploadRes = await request(app)
      .post(`/api/reports/${reportId}/attachment`)
      .set('Authorization', `Bearer ${editorToken}`)
      .attach('file', Buffer.from('test'), 'expire.txt');
    const signedUrl = uploadRes.body.signedUrl;
    const url = new URL(signedUrl, 'http://localhost');
    const signature = url.searchParams.get('signature');
    const pastExpiry = Math.floor(Date.now() / 1000) - 100;
    const fakeUrl = `/attachments/${uploadRes.body.fileId}/download?expiry=${pastExpiry}&signature=${signature}`;
    const downloadRes = await request(app).get(fakeUrl);
    expect(downloadRes.status).toBe(401);
  });
});