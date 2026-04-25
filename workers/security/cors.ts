// Supports a single origin or a comma-separated list in CORS_ALLOWED_ORIGIN.
// Falls back to HRMS_BASE_URL when CORS_ALLOWED_ORIGIN is not set.
function getAllowedOrigins(env: Env): Set<string> {
  const raw = env.CORS_ALLOWED_ORIGIN || env.HRMS_BASE_URL || "";
  return new Set(
    raw
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  );
}

export function buildCorsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  const allowed = getAllowedOrigins(env);

  if (origin && allowed.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Credentials", "true");
  }

  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");

  return headers;
}

export function handleCorsPreflight(request: Request, env: Env): Response | null {
  if (request.method !== "OPTIONS") return null;
  if (!new URL(request.url).pathname.startsWith("/api/")) return null;

  const corsHeaders = buildCorsHeaders(request, env);
  if (!corsHeaders.get("Access-Control-Allow-Origin")) {
    return new Response(JSON.stringify({ error: "Origin not allowed." }), {
      status: 403,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export function withCors(response: Response, request: Request, env: Env): Response {
  const headers = new Headers(response.headers);
  const corsHeaders = buildCorsHeaders(request, env);
  corsHeaders.forEach((value, key) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
