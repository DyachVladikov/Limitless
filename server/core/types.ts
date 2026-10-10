// Dynamic PostgreSQL row boundary. Public request values are validated before use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
export interface Sql {
  query<T = Row>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}
export interface GameEvent { type: string; [key: string]: unknown }
export interface GameContext {
  db: Sql;
  profile: Row;
  now: string;
  today: string;
  events: GameEvent[];
}
export interface Input { params: Record<string, string>; query: URLSearchParams; body: Row }
export interface Route {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  handle(ctx: GameContext, input: Input): Promise<unknown>;
  status?: number;
}
