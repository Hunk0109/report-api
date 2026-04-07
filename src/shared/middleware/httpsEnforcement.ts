import type { Request, Response, NextFunction } from 'express';

export interface HttpsEnforcementOptions {
  enabled: boolean;
}

export function createHttpsEnforcementMiddleware(options: HttpsEnforcementOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!options.enabled) {
      next();
      return;
    }

    const forwardedProto = String(req.headers['x-forwarded-proto'] ?? '');
    const isHttps = req.secure || forwardedProto.includes('https');
    if (isHttps) {
      next();
      return;
    }

    res.status(426).json({
      error: 'HTTPS_REQUIRED',
      message: 'HTTPS is required for this endpoint',
      statusCode: 426,
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId
    });
  };
}
