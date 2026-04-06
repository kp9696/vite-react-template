import { redirect } from "react-router";
import { DEMO_EMAIL, DEMO_USER, getUserByEmail } from "./hrms.server";

const SESSION_COOKIE = "hrms_demo_session";

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

export function createSessionCookie(email: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(email.trim().toLowerCase())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function getSessionEmail(request: Request): string | null {
  const cookies = parseCookieHeader(request.headers.get("Cookie"));
  return cookies[SESSION_COOKIE] ?? null;
}

export async function requireSignedInUser(request: Request, db: D1Database) {
  const email = getSessionEmail(request);
  if (!email) {
    throw redirect("/login");
  }

  if (email === DEMO_EMAIL) {
    return DEMO_USER;
  }

  const user = await getUserByEmail(db, email);
  if (!user) {
    throw redirect("/login", {
      headers: {
        "Set-Cookie": clearSessionCookie(),
      },
    });
  }

  return user;
}
