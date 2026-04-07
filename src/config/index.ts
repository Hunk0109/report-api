import path from 'path';
import { config as loadEnv } from 'dotenv';

loadEnv();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseNumber(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return defaultValue;
  }
  const n = Number(raw);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid number for ${name}`);
  }
  return n;
}

function parseFloatEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return defaultValue;
  }
  const n = Number.parseFloat(raw);
  if (Number.isNaN(n)) {
    throw new Error(`Invalid float for ${name}`);
  }
  return n;
}

function parseBooleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return defaultValue;
  }
  return raw === 'true' || raw === '1';
}

const uploadDir = process.env.UPLOAD_DIR ?? './uploads';

export const appConfig = {
  port: parseNumber('PORT', 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: requireEnv('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '24h',
  uploadMaxSize: parseNumber('UPLOAD_MAX_SIZE', 10_485_760),
  allowedFileTypes: (process.env.ALLOWED_FILE_TYPES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  uploadDir: path.resolve(uploadDir),
  signedUrlSecret: process.env.SIGNED_URL_SECRET ?? requireEnv('JWT_SECRET'),
  signedUrlExpirySeconds: parseNumber('SIGNED_URL_EXPIRY', 3600),
  rateLimitWindowMs: parseNumber('RATE_LIMIT_WINDOW_MS', 900_000),
  rateLimitMaxRequests: parseNumber('RATE_LIMIT_MAX_REQUESTS', 100),
  enforceHttps: parseBooleanEnv('ENFORCE_HTTPS', false),
  queueFailureRate: parseFloatEnv('QUEUE_FAILURE_RATE', 0.1),
  signedUrlExpiry: parseInt(process.env.SIGNED_URL_EXPIRY || '3600', 10),
  idempotencyTtlMs: 24 * 60 * 60 * 1000
} as const;
