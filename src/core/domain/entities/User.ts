export type UserRole = 'reader' | 'editor' | 'admin';

export interface UserProps {
  id: string;
  email: string;
  role: UserRole;
}

export class User {
  readonly id: string;
  readonly email: string;
  readonly role: UserRole;

  constructor(props: UserProps) {
    this.id = props.id;
    this.email = props.email;
    this.role = props.role;
  }
}
