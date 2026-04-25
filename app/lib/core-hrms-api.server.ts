import { handleCoreHrmsApi } from "../../workers/modules/hrms-core";

interface SignedInUserShape {
  id: string;
  companyId?: string | null;
  email: string;
  name: string;
  role: string;
}

interface AccessTokenPayload {
  sub: string;
  name: string;
  userId: string;
  tenantId: string;
  role: string;
  typ: "access";
  iat: number;
  exp: number;
}

const ACCESS_TTL_SECONDS = 15 * 60;

function base64UrlEncode(raw: string): string {
  const bytes = new TextEncoder().encode(raw);
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signAccessToken(user: SignedInUserShape, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessTokenPayload = {
    sub: user.email.trim().toLowerCase(),
    name: user.name,
    userId: user.id,
    tenantId: user.companyId ?? "NO_TENANT",
    role: user.role,
    typ: "access",
    iat: now,
    exp: now + ACCESS_TTL_SECONDS,
  };

  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${arrayBufferToBase64Url(signature)}`;
}

/**
 * Sign a short-lived access token for the given user — used when the client
 * needs to make authenticated fetch() calls directly (e.g. HRBot streaming).
 */
export async function signApiToken(currentUser: SignedInUserShape, env: Env): Promise<string> {
  const accessSecret = env.JWT_ACCESS_SECRET ?? env.JWT_SECRET;
  if (!accessSecret) throw new Error("JWT secret not configured");
  const userWithTenant: SignedInUserShape = {
    ...currentUser,
    companyId: currentUser.companyId ?? currentUser.id,
  };
  return signAccessToken(userWithTenant, accessSecret);
}

/**
 * Call an internal HRMS API handler directly (no HTTP self-fetch).
 *
 * Cloudflare Workers block loop-back subrequests to their own domain
 * (error 1042), so we build a synthetic Request and pass it straight to
 * handleCoreHrmsApi instead of going through fetch().
 */
export async function callCoreHrmsApi<T>(params: {
  request: Request;
  env: Env;
  currentUser: SignedInUserShape;
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
}): Promise<T | null> {
  const { request, env, currentUser, path, method = "GET", body } = params;
  const accessSecret = env.JWT_ACCESS_SECRET ?? env.JWT_SECRET;

  if (!accessSecret) {
    return null;
  }

  // Ensure companyId is always set — fall back to user id so tenant-scoped
  // queries still work for standalone admin accounts with no org.
  const userWithTenant: SignedInUserShape = {
    ...currentUser,
    companyId: currentUser.companyId ?? currentUser.id,
  };

  const token = await signAccessToken(userWithTenant, accessSecret);
  const url = new URL(path, request.url);

  // Build a synthetic Request so we can call handleCoreHrmsApi directly,
  // avoiding the Cloudflare loop-back subrequest restriction (error 1042).
  const syntheticRequest = new Request(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  try {
    const response = await handleCoreHrmsApi(syntheticRequest, env);

    if (!response) {
      // Route not matched — should not happen for known paths.
      console.warn(`[callCoreHrmsApi] No handler matched for path: ${path}`);
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "(unreadable body)");
      console.error(
        `[callCoreHrmsApi] Handler returned ${response.status} for ${method} ${path}:`,
        errorText,
      );
      return null;
    }

    const data = (await response.json()) as T;
    return data;
  } catch (err) {
    console.error(
      `[callCoreHrmsApi] Unexpected error calling ${method} ${path}:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
