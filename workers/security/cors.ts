export function getAllowedOrigin(env: Env): string {
  return env.CORS_ALLOWED_ORIGIN || env.HRMS_BASE_URL || "";
}

export function buildCorsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  const allowedOrigin = getAllowedOrigin(env);

  if (origin && allowedOrigin && origin === allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
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
