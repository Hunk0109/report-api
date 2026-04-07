import type { UserRole } from '../../core/domain/entities/User';

export function canAccessReportsRoute(method: string, role: UserRole): boolean {
  if (role === 'reader') {
    return method === 'GET';
  }
  if (role === 'editor' || role === 'admin') {
    return true;
  }
  return false;
}
