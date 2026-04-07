import winston from 'winston';
import path from 'path';
import fs from 'fs';
import type { ILogger, LogMeta } from '../../core/ports/ILogger';

const logDir = path.resolve('./logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const baseFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const winstonLogger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: baseFormat,
  transports: [
    new winston.transports.File({ filename: path.join(logDir, 'app.log') }),
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple())
    })
  ]
});

function mergeMeta(meta?: LogMeta): LogMeta {
  return meta ?? {};
}

export class WinstonLogger implements ILogger {
  info(message: string, meta?: LogMeta): void {
    winstonLogger.info(message, mergeMeta(meta));
  }

  warn(message: string, meta?: LogMeta): void {
    winstonLogger.warn(message, mergeMeta(meta));
  }

  error(message: string, meta?: LogMeta): void {
    winstonLogger.error(message, mergeMeta(meta));
  }

  debug(message: string, meta?: LogMeta): void {
    winstonLogger.debug(message, mergeMeta(meta));
  }
}
