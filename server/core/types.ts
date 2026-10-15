// Строка из PostgreSQL. Входные поля проверяются в контроллере до записи.
export type Row = Record<string, any>;
export interface Sql {
  query<T = Row>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}
export interface GameEvent {
  type: string;
  [key: string]: unknown;
}
export interface GameContext {
  db: Sql;
  profile: Row;
  now: string;
  today: string;
  events: GameEvent[];
}
export interface Input {
  params: Record<string, string>;
  query: URLSearchParams;
  body: Row;
}
