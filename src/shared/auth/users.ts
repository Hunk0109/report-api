import type { UserRole } from '../../core/domain/entities/User';

export interface HardcodedUser {
  id: string;
  email: string;
  role: UserRole;
}

export const HARDCODED_USERS: Record<
  'user-reader' | 'user-editor' | 'user-admin',
  HardcodedUser
> = {
  'user-reader': { id: '1', email: 'reader@example.com', role: 'reader' },
  'user-editor': { id: '2', email: 'editor@example.com', role: 'editor' },
  'user-admin': { id: '3', email: 'admin@example.com', role: 'admin' }
};
