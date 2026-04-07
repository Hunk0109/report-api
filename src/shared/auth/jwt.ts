import jwt, { type SignOptions } from 'jsonwebtoken';
import { appConfig } from '../../config';
import type { UserRole } from '../../core/domain/entities/User';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export function signToken(input: { userId: string; email: string; role: UserRole }): string {
  return jwt.sign(
    { sub: input.userId, email: input.email, role: input.role },
    appConfig.jwtSecret,
    { expiresIn: appConfig.jwtExpiresIn } as SignOptions
  );
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, appConfig.jwtSecret) as JwtPayload;
  return decoded;
}
