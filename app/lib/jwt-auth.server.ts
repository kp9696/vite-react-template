import { redirect } from "react-router";
import { getUserById } from "./hrms.server";

const REFRESH_COOKIE = "refresh_token";
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60;
const MAX_ACTIVE_SESSIONS = 5;

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, pair) => {
      const index = pair.indexOf("=");
      if (index === -1) return cookies;
      cookies[pair.slice(0, index)] = decodeURIComponent(pair.slice(index + 1));
      return cookies;
    }, {});
}

function buildRefreshCookie(value: string, maxAge: number, requestUrl?: string): string {
  const secure = requestUrl && new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${REFRESH_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearRefreshCookie(requestUrl?: string): string {
  return buildRefreshCookie("", 0, requestUrl);
}

function generateOpaqueRefreshToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getRefreshTokenFromRequest(request: Request): string | null {
  const cookies = parseCookieHeader(request.headers.get("Cookie"));
  return cookies[REFRESH_COOKIE] ?? null;
}

async function enforceMaxActiveSessions(db: D1Database, userId: string): Promise<void> {
  const active = await db
    .prepare(
      `SELECT id FROM refresh_tokens
       WHERE user_id = ? AND revoked = 0 AND expires_at > ?
       ORDER BY created_at DESC`,
    )
    .bind(userId, Math.floor(Date.now() / 1000))
    .all<{ id: string }>();

  if (active.results.length <= MAX_ACTIVE_SESSIONS) {
    return;
  }

  const overflow = active.results.slice(MAX_ACTIVE_SESSIONS);
  await Promise.all(
    overflow.map((row) =>
      db.prepare(`UPDATE refresh_tokens SET revoked = 1 WHERE id = ?`).bind(row.id).run()
    ),
  );
}

async function getRequestFingerprint(request: Request): Promise<string> {
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "unknown";
  const ua = request.headers.get("User-Agent") || "unknown";
  return sha256Hex(`${ip}|${ua}`);
}

export async function createAuthSessionCookie(env: Env, email: string, request: Request): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await env.HRMS
    .prepare(`SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1`)
    .bind(normalizedEmail)
    .first<{ id: string }>();

  if (!user) {
    throw new Error("User profile not found for auth session.");
  }

  const userId = user.id;

  const rawToken = generateOpaqueRefreshToken();
  const tokenHash = await sha256Hex(rawToken);
  const fingerprint = await getRequestFingerprint(request);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + REFRESH_MAX_AGE;

  await env.HRMS
    .prepare(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked, created_at, fingerprint)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
    )
    .bind(crypto.randomUUID(), userId, tokenHash, expiresAt, now, fingerprint)
    .run();

  await enforceMaxActiveSessions(env.HRMS, userId);

  return buildRefreshCookie(rawToken, REFRESH_MAX_AGE, request.url);
}

export async function destroyAuthSession(request: Request, env: Env): Promise<void> {
  const raw = getRefreshTokenFromRequest(request);
  if (!raw) return;

  const hash = await sha256Hex(raw);
  await env.HRMS
    .prepare(`UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?`)
    .bind(hash)
    .run();
}

export async function requireSignedInUser(request: Request, env: Env) {
  const refreshToken = getRefreshTokenFromRequest(request);
  if (!refreshToken) {
    throw redirect("/login");
  }

  const hash = await sha256Hex(refreshToken);
  const tokenRow = await env.HRMS
    .prepare(
      `SELECT user_id, revoked, expires_at
       FROM refresh_tokens
       WHERE token_hash = ?
       LIMIT 1`,
    )
    .bind(hash)
    .first<{ user_id: string; revoked: number; expires_at: number }>();

  if (!tokenRow || tokenRow.revoked === 1 || tokenRow.expires_at <= Math.floor(Date.now() / 1000)) {
    throw redirect("/login", {
      headers: {
        "Set-Cookie": clearRefreshCookie(request.url),
      },
    });
  }

  const user = await getUserById(env.HRMS, tokenRow.user_id);
  if (!user) {
    throw redirect("/login", {
      headers: {
        "Set-Cookie": clearRefreshCookie(request.url),
      },
    });
  }

  return user;
}
