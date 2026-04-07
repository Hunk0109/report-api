process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';
process.env.SIGNED_URL_SECRET = process.env.SIGNED_URL_SECRET ?? 'test-signed-secret';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '24h';
process.env.UPLOAD_MAX_SIZE = process.env.UPLOAD_MAX_SIZE ?? '10485760';
process.env.ALLOWED_FILE_TYPES =
  process.env.ALLOWED_FILE_TYPES ?? 'image/jpeg,image/png,application/pdf,text/plain';
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR ?? './uploads-test';
process.env.SIGNED_URL_EXPIRY = process.env.SIGNED_URL_EXPIRY ?? '3600';
process.env.RATE_LIMIT_WINDOW_MS = process.env.RATE_LIMIT_WINDOW_MS ?? '900000';
process.env.RATE_LIMIT_MAX_REQUESTS = process.env.RATE_LIMIT_MAX_REQUESTS ?? '100';
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.ENFORCE_HTTPS = process.env.ENFORCE_HTTPS ?? 'false';
process.env.QUEUE_FAILURE_RATE = process.env.QUEUE_FAILURE_RATE ?? '0';
