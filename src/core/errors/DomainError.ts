export type DomainErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'FORBIDDEN'
  | 'PRECONDITION_FAILED'
  | 'UNPROCESSABLE_ENTITY';

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly field?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: DomainErrorCode,
    message: string,
    options?: { field?: string; details?: Record<string, unknown> }
  ) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.field = options?.field;
    this.details = options?.details;
  }
}
