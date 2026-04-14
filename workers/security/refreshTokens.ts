const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_ACTIVE_SESSIONS = 5;

export interface StoredRefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  revoked: number;
  created_at: number;
  fingerprint: string | null;
}

export interface RefreshIssueInput {
  userId: string;
  tokenHash: string;
  fingerprint: string;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateOpaqueRefreshToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, "")}`;
}

export function refreshExpiresAt(): number {
  return Math.floor(Date.now() / 1000) + REFRESH_TTL_SECONDS;
}

export async function createRefreshTokenRecord(db: D1Database, input: RefreshIssueInput): Promise<StoredRefreshToken> {
  const id = crypto.randomUUID();
  const createdAt = Math.floor(Date.now() / 1000);
  const expiresAt = refreshExpiresAt();

  await db
    .prepare(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked, created_at, fingerprint)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    )
    .bind(id, input.userId, input.tokenHash, expiresAt, createdAt, input.fingerprint)
    .run();

  await enforceMaxActiveSessions(db, input.userId);

  return {
    id,
    user_id: input.userId,
    token_hash: input.tokenHash,
    expires_at: expiresAt,
    revoked: 0,
    created_at: createdAt,
    fingerprint: input.fingerprint,
  };
}

export async function enforceMaxActiveSessions(db: D1Database, userId: string): Promise<void> {
  const active = await db
    .prepare(
      `SELECT id FROM refresh_tokens
       WHERE user_id = ? AND revoked = 0 AND expires_at > ?
       ORDER BY created_at DESC`,
    )
    .bind(userId, Math.floor(Date.now() / 1000))
    .all<{ id: string }>();

  const sessions = active.results;
  if (sessions.length <= MAX_ACTIVE_SESSIONS) {
    return;
  }

  const overflow = sessions.slice(MAX_ACTIVE_SESSIONS);
  await Promise.all(
    overflow.map((session) =>
      db.prepare(`UPDATE refresh_tokens SET revoked = 1 WHERE id = ?`).bind(session.id).run()
    ),
  );
}

export async function findActiveRefreshTokenByHash(
  db: D1Database,
  tokenHash: string,
): Promise<StoredRefreshToken | null> {
  return db
    .prepare(
      `SELECT id, user_id, token_hash, expires_at, revoked, created_at, fingerprint
       FROM refresh_tokens
       WHERE token_hash = ?
       LIMIT 1`,
    )
    .bind(tokenHash)
    .first<StoredRefreshToken>();
}

export async function revokeRefreshTokenById(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(`UPDATE refresh_tokens SET revoked = 1 WHERE id = ?`)
    .bind(id)
    .run();
}

export async function revokeRefreshTokenByHash(db: D1Database, tokenHash: string): Promise<void> {
  await db
    .prepare(`UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?`)
    .bind(tokenHash)
    .run();
}

export async function logAuthEvent(
  db: D1Database,
  eventType: "login" | "logout" | "refresh",
  userId: string | null,
  ipAddress: string,
  userAgent: string,
  detail: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO auth_audit_logs (id, user_id, event_type, ip_address, user_agent, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      userId,
      eventType,
      ipAddress,
      userAgent,
      detail,
      Math.floor(Date.now() / 1000),
    )
    .run();
}

export function isRefreshTokenUsable(token: StoredRefreshToken | null): boolean {
  if (!token) return false;
  if (token.revoked === 1) return false;
  if (token.expires_at <= Math.floor(Date.now() / 1000)) return false;
  return true;
}
