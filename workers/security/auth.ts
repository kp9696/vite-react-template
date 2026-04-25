import bcrypt from "bcryptjs";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const BCRYPT_ROUNDS = 12;

export interface AuthTokenPayload {
  sub: string;
  name: string;
  userId: string;
  tenantId: string;
  role: string;
  typ: "access" | "refresh";
  iat: number;
  exp: number;
}

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
  name: string;
}

function base64UrlEncode(data: ArrayBuffer | string): string {
  const bytes = typeof data === "string"
    ? new TextEncoder().encode(data)
    : new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + "=".repeat(padLen));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signToken(payload: AuthTokenPayload, secret: string): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const key = await getHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlEncode(sig)}`;
}

export async function verifyToken(token: string, secret: string): Promise<AuthTokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, sig] = parts;
  const signingInput = `${header}.${body}`;
  const key = await getHmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecode(sig).buffer as ArrayBuffer,
    new TextEncoder().encode(signingInput),
  );

  if (!valid) return null;

  let payload: AuthTokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as AuthTokenPayload;
  } catch {
    return null;
  }

  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  if (payload.typ !== "access" && payload.typ !== "refresh") {
    return null;
  }

  return payload;
}

export async function createAccessToken(
  subjectEmail: string,
  name: string,
  userId: string,
  tenantId: string,
  role: string,
  secret: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signToken(
    {
      sub: subjectEmail,
      name,
      userId,
      tenantId,
      role,
      typ: "access",
      iat: now,
      exp: now + ACCESS_TOKEN_TTL_SECONDS,
    },
    secret,
  );
}

export function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, item) => {
      const i = item.indexOf("=");
      if (i === -1) return acc;
      acc[item.slice(0, i)] = decodeURIComponent(item.slice(i + 1));
      return acc;
    }, {});
}

export function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

export async function verifyAccessToken(token: string, secret: string): Promise<AuthTokenPayload | null> {
  const payload = await verifyToken(token, secret);
  if (!payload || payload.typ !== "access") {
    return null;
  }
  return payload;
}

export function attachUserToContext(payload: AuthTokenPayload): AuthContext {
  return {
    userId: payload.userId,
    tenantId: payload.tenantId,
    role: payload.role,
    email: payload.sub,
    name: payload.name,
  };
}

export async function requireAuth(request: Request, secret: string): Promise<AuthContext | null> {
  const token = getBearerToken(request);
  if (!token) {
    return null;
  }

  const payload = await verifyAccessToken(token, secret);
  if (!payload) {
    return null;
  }

  return attachUserToContext(payload);
}

export function buildRefreshCookie(token: string, requestUrl: string): string {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `refresh_token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${REFRESH_TOKEN_TTL_SECONDS}${secure}`;
}

export function clearRefreshCookie(requestUrl: string): string {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `refresh_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function legacySha256Hex(password: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isLegacySha256Hash(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

export async function verifyPasswordWithMigration(
  db: D1Database,
  email: string,
  plainPassword: string,
  storedHash: string,
): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();

  // bcrypt hash path (new secure format)
  if (storedHash.startsWith("$2")) {
    return bcrypt.compare(plainPassword, storedHash);
  }

  // legacy SHA-256 fallback with auto-upgrade to bcrypt
  if (isLegacySha256Hash(storedHash)) {
    const legacy = await legacySha256Hex(plainPassword);
    if (legacy !== storedHash) {
      return false;
    }

    const upgraded = await hashPassword(plainPassword);
    await db
      .prepare(`UPDATE auth_users SET password = ? WHERE lower(email) = lower(?)`)
      .bind(upgraded, normalizedEmail)
      .run();

    return true;
  }

  return false;
}
