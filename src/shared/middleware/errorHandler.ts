import { Request, Response, NextFunction } from 'express';
import { WinstonLogger } from '../logging/winstonLogger';
import { DomainError } from '../../core/errors/DomainError';
import { ZodError } from 'zod';

export const errorHandler = (logger: WinstonLogger) => {
  return (err: Error, req: Request, res: Response, _next: NextFunction) => {
    const requestId = (req as any).requestId ?? 'unknown';

    // 🔹 Structured logging
    logger.error('Request error', {
      requestId,
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    // 🔹 Zod validation errors
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.errors,
        statusCode: 400,
        timestamp: new Date().toISOString(),
        requestId,
      });
    }

    // 🔹 Domain errors
    if (err instanceof DomainError) {
      let statusCode = 500;

      switch (err.code) {
        case 'NOT_FOUND':
          statusCode = 404;
          break;
        case 'CONFLICT':
          statusCode = 409;
          break;
        case 'FORBIDDEN':
          statusCode = 403;
          break;
        case 'VALIDATION':
          statusCode = 422;
          break;
        default:
          statusCode = 500;
      }

      return res.status(statusCode).json({
        error: err.code ?? 'DOMAIN_ERROR',
        message: err.message ?? 'Domain error occurred',
        statusCode,
        timestamp: new Date().toISOString(),
        requestId,
        field: (err as any).field,
      });
    }

    // 🔹 Fallback (unknown errors)
    return res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected error occurred',
      statusCode: 500,
      timestamp: new Date().toISOString(),
      requestId,
    });
  };
};