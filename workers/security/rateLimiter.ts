interface LimitState {
  allowed: boolean;
  limit: number;
  count: number;
  retryAfter: number;
}

const LOCK_TTL_SECONDS = 3;
const LOCK_RETRIES = 3;

function windowKey(prefix: string, identifier: string, windowSeconds: number): string {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  return `${prefix}:${identifier}:${bucket}`;
}

async function hitWindow(
  kv: KVNamespace,
  prefix: string,
  identifier: string,
  windowSeconds: number,
  limit: number,
): Promise<LimitState> {
  const key = windowKey(prefix, identifier, windowSeconds);
  const lockKey = `${key}:lock`;
  const owner = crypto.randomUUID();

  let acquired = false;
  for (let i = 0; i < LOCK_RETRIES; i++) {
    await kv.put(lockKey, owner, { expirationTtl: LOCK_TTL_SECONDS });
    const lockValue = await kv.get(lockKey);
    if (lockValue === owner) {
      acquired = true;
      break;
    }
  }

  if (!acquired) {
    return {
      allowed: false,
      limit,
      count: limit + 1,
      retryAfter: LOCK_TTL_SECONDS,
    };
  }

  const raw = await kv.get(key);
  const current = raw ? parseInt(raw, 10) : 0;
  const next = current + 1;

  await kv.put(key, String(next), { expirationTtl: windowSeconds + 30 });
  await kv.delete(lockKey);

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
