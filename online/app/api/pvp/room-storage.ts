export type D1Result = {
  success: boolean;
  meta?: { changes?: number };
};

export type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<D1Result>;
};

export type D1Database = {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1Result[]>;
};

type CreateRoomOptions = {
  now: number;
  expiresAt: number;
  hostToken: string;
  offer: string;
  createCode(): string;
  maxAttempts?: number;
};

export async function createPersistedRoom(
  db: D1Database,
  {
    now,
    expiresAt,
    hostToken,
    offer,
    createCode,
    maxAttempts = 6,
  }: CreateRoomOptions,
): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = createCode();
    const insert = db
      .prepare(
        "INSERT OR IGNORE INTO pvp_rooms (code, host_token, offer, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(code, hostToken, offer, now, expiresAt);
    const results =
      attempt === 0
        ? await db.batch([
            db
              .prepare("DELETE FROM pvp_rooms WHERE expires_at < ?")
              .bind(now),
            insert,
          ])
        : [await insert.run()];
    if ((results.at(-1)?.meta?.changes ?? 0) > 0) return code;
  }
  return null;
}
