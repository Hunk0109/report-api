import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../auth/jwt';
import { canAccessReportsRoute } from '../auth/roles';

export function authenticateJwt(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Missing or invalid Authorization header',
      statusCode: 401,
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId
    });
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = verifyToken(token);
    (req as any).user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role
    };
    next();
  } catch {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Invalid or expired token',
      statusCode: 401,
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId
    });
  }
}

export function authorizeReportsAccess(req: Request, res: Response, next: NextFunction): void {
  if (!(req as any).user) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentication required',
      statusCode: 401,
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId
    });
    return;
  }
  if (!canAccessReportsRoute(req.method, (req as any).user.role)) {
    res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Insufficient permissions for this operation',
      statusCode: 403,
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId
    });
    return;
  }
  next();
}