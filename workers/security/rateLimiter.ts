interface LimitState {
  allowed: boolean;
  limit: number;
  count: number;
  retryAfter: number;
}

function windowKey(prefix: string, identifier: string, windowSeconds: number): string {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  return `${prefix}:${identifier}:${bucket}`;
}

// Best-effort read-modify-write counter. Cloudflare KV is eventually consistent,
// so we intentionally avoid a mutex — rate limits tolerate small over/undercounts
// under concurrent load, and a KV-based CAS lock produces spurious 429s.
async function hitWindow(
  kv: KVNamespace,
  prefix: string,
  identifier: string,
  windowSeconds: number,
  limit: number,
): Promise<LimitState> {
  const key = windowKey(prefix, identifier, windowSeconds);
  const raw = await kv.get(key);
  const current = raw ? parseInt(raw, 10) : 0;
  const next = current + 1;

  await kv.put(key, String(next), { expirationTtl: windowSeconds + 30 });

  return {
    allowed: next <= limit,
    limit,
    count: next,
    retryAfter: windowSeconds,
  };
}

export function extractClientIp(request: Request): string {
  const cfConnectingIp = request.headers.get("CF-Connecting-IP");
  if (cfConnectingIp) return cfConnectingIp;

  const xForwardedFor = request.headers.get("X-Forwarded-For");
  if (!xForwardedFor) return "unknown";

  return xForwardedFor.split(",")[0]?.trim() || "unknown";
}

export async function enforceLoginRateLimit(
  kv: KVNamespace,
  ip: string,
  email: string,
): Promise<{ ok: true } | { ok: false; message: string; retryAfter: number }> {
  const ipLimit = await hitWindow(kv, "rl:login:ip", ip, 5 * 60, 5);
  if (!ipLimit.allowed) {
    return {
      ok: false,
      message: "Too many login attempts from this IP. Try again in a few minutes.",
      retryAfter: ipLimit.retryAfter,
    };
  }

  const emailLimit = await hitWindow(kv, "rl:login:email", email.toLowerCase(), 60 * 60, 10);
  if (!emailLimit.allowed) {
    return {
      ok: false,
      message: "Too many login attempts for this account. Try again later.",
      retryAfter: emailLimit.retryAfter,
    };
  }

  return { ok: true };
}

export async function enforceOtpIpRateLimit(
  kv: KVNamespace,
  ip: string,
): Promise<{ ok: true } | { ok: false; message: string; retryAfter: number }> {
  const ipLimit = await hitWindow(kv, "rl:otp:ip", ip, 60 * 60, 10);
  if (!ipLimit.allowed) {
    return {
      ok: false,
      message: "Too many OTP requests from this IP. Please try again later.",
      retryAfter: ipLimit.retryAfter,
    };
  }

  return { ok: true };
}
