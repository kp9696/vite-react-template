import { redirect } from "react-router";
import { DEMO_EMAIL, DEMO_USER, getUserByEmail } from "./hrms.server";

const SESSION_COOKIE = "hrms_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

let sessionSchemaReady = false;

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, pair) => {
      const index = pair.indexOf("=");
      if (index === -1) return cookies;
      const key = pair.slice(0, index);
      const value = pair.slice(index + 1);
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

async function ensureSessionSchema(db: D1Database) {
  if (sessionSchemaReady) {
    return;
  }

  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_sessions_email
       ON sessions(email)`,
    ),
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
       ON sessions(expires_at)`,
    ),
  ]);

  sessionSchemaReady = true;
}

function isSecureRequest(requestUrl?: string): boolean {
  if (!requestUrl) {
    return false;
  }

  try {
    return new URL(requestUrl).protocol === "https:";
  } catch {
    return false;
  }
}

function buildSessionCookie(value: string, maxAge: number, requestUrl?: string): string {
  const secure = isSecureRequest(requestUrl) ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function createSessionCookie(db: D1Database, email: string, requestUrl?: string): Promise<string> {
  await ensureSessionSchema(db);

  const sessionId = crypto.randomUUID();
  const normalizedEmail = email.trim().toLowerCase();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();

  await db.prepare(`DELETE FROM sessions WHERE expires_at <= ?`).bind(new Date().toISOString()).run();
  await db
    .prepare(
      `INSERT INTO sessions (id, email, expires_at)
       VALUES (?, ?, ?)`,
    )
    .bind(sessionId, normalizedEmail, expiresAt)
    .run();

  return buildSessionCookie(sessionId, SESSION_MAX_AGE, requestUrl);
}

export function clearSessionCookie(requestUrl?: string): string {
  return buildSessionCookie("", 0, requestUrl);
}

function getSessionId(request: Request): string | null {
  const cookies = parseCookieHeader(request.headers.get("Cookie"));
  return cookies[SESSION_COOKIE] ?? null;
}

export async function destroySession(request: Request, db: D1Database): Promise<void> {
  await ensureSessionSchema(db);

  const sessionId = getSessionId(request);
  if (!sessionId) {
    return;
  }

  await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sessionId).run();
}

async function getSessionEmail(request: Request, db: D1Database): Promise<string | null> {
  await ensureSessionSchema(db);

  const sessionId = getSessionId(request);
  if (!sessionId) {
    return null;
  }

  const record = await db
    .prepare(
      `SELECT email, expires_at
       FROM sessions
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(sessionId)
    .first<{ email: string; expires_at: string }>();

  if (!record) {
    return null;
  }

  if (new Date(record.expires_at).getTime() < Date.now()) {
    await db.prepare(`DELETE FROM sessions WHERE id = ?`).bind(sessionId).run();
    return null;
  }

  return record.email;
}

export async function requireSignedInUser(request: Request, db: D1Database) {
  const email = await getSessionEmail(request, db);
  if (!email) {
    throw redirect("/login");
  }

  if (email === DEMO_EMAIL) {
    return DEMO_USER;
  }

  const user = await getUserByEmail(db, email);
  if (!user) {
    await destroySession(request, db);
    throw redirect("/login", {
      headers: {
        "Set-Cookie": clearSessionCookie(request.url),
      },
    });
  }

  return user;
}
