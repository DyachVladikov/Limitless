export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export function requireRow<T>(row: T | null | undefined, message = 'Запись не найдена'): T {
  if (row == null) throw new ApiError(404, 'NOT_FOUND', message);
  return row;
}
