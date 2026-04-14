interface SignedInUserShape {
  id: string;
  orgId: string | null;
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
    tenantId: user.orgId ?? "NO_TENANT",
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

export async function callCoreHrmsApi<T>(params: {
  request: Request;
  env: Env;
  currentUser: SignedInUserShape;
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: Record<string, unknown>;
}): Promise<T | null> {
  const { request, env, currentUser, path, method = "GET", body } = params;
  const accessSecret = env.JWT_ACCESS_SECRET ?? env.JWT_SECRET;

  if (!accessSecret || !currentUser.orgId) {
    return null;
  }

  const token = await signAccessToken(currentUser, accessSecret);
  const url = new URL(path, request.url);

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
