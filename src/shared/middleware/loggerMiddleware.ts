import { Request, Response, NextFunction } from 'express';
import { WinstonLogger } from '../logging/winstonLogger';

export const createLoggerMiddleware = (logger: WinstonLogger) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info('HTTP request', {
        requestId: (req as any).requestId,
        userId: (req as any).user?.id,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: duration,
      });
    });
    next();
  };
};