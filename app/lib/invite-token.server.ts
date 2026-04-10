interface InviteTokenRecord {
  userId: string;
  email: string;
  expiresAt: string;
}

let inviteTokenSchemaReady = false;

async function ensureInviteTokenSchema(db: D1Database) {
  if (inviteTokenSchemaReady) {
    return;
  }

  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS invite_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_invite_tokens_user_id
       ON invite_tokens(user_id)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_invite_tokens_email
       ON invite_tokens(email)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_invite_tokens_expires_at
       ON invite_tokens(expires_at)`,
    ),
  ]);

  inviteTokenSchemaReady = true;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, "0")).join("");
}

export async function createInviteToken(db: D1Database, userId: string, email: string): Promise<string> {
  await ensureInviteTokenSchema(db);

  const token = `${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, "")}`;
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await db.batch([
    db.prepare(`DELETE FROM invite_tokens WHERE user_id = ? OR lower(email) = lower(?)`).bind(userId, email.trim().toLowerCase()),
    db.prepare(
      `INSERT INTO invite_tokens (token_hash, user_id, email, expires_at)
       VALUES (?, ?, ?, ?)`,
    ).bind(tokenHash, userId, email.trim().toLowerCase(), expiresAt),
  ]);

  return token;
}

export async function consumeInviteToken(db: D1Database, token: string): Promise<InviteTokenRecord> {
  await ensureInviteTokenSchema(db);

  const tokenHash = await sha256Hex(token.trim());
  const record = await db
    .prepare(
      `SELECT user_id, email, expires_at
       FROM invite_tokens
       WHERE token_hash = ?
       LIMIT 1`,
    )
    .bind(tokenHash)
    .first<{ user_id: string; email: string; expires_at: string }>();

  if (!record) {
    throw new Error("This invite link is invalid or has already been used.");
  }

  if (new Date(record.expires_at).getTime() < Date.now()) {
    await db.prepare(`DELETE FROM invite_tokens WHERE token_hash = ?`).bind(tokenHash).run();
    throw new Error("This invite link has expired. Ask your admin to send a new one.");
  }

  await db.batch([
    db.prepare(`DELETE FROM invite_tokens WHERE token_hash = ?`).bind(tokenHash),
    db.prepare(`DELETE FROM invite_tokens WHERE user_id = ?`).bind(record.user_id),
  ]);

  return {
    userId: record.user_id,
    email: record.email,
    expiresAt: record.expires_at,
  };
}