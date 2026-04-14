import { createRequestHandler } from "react-router";

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

// ─── Constants ────────────────────────────────────────────────────────────────

const OTP_TTL_SECONDS = 300; // 5 minutes
const MAX_OTP_ATTEMPTS = 5;
const LOCKOUT_TTL_SECONDS = 900; // 15 minutes after too many attempts
const RESEND_COOLDOWN_SECONDS = 60; // 1 minute between resend requests

// ─── Types ────────────────────────────────────────────────────────────────────

interface SendSignupOtpInput {
  name: string;
  email: string;
  password: string;
}

interface VerifySignupOtpInput {
  email: string;
  otp: string;
}

interface PendingSignupRecord {
  otp: string;
  name: string;
  password: string;
  createdAt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateOtpCode(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(bytes[0] % 900000 + 100000);
}

async function hashPassword(password: string): Promise<string> {
  const encoded = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

// ─── Database ─────────────────────────────────────────────────────────────────

async function ensureAuthUsersTable(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS auth_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        is_verified INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
    )
    .run();
}

// ─── Brute-force protection ───────────────────────────────────────────────────

const ATTEMPT_KEY = (email: string) => `otp:attempts:${email}`;
const LOCKOUT_KEY = (email: string) => `otp:locked:${email}`;

async function isLockedOut(kv: KVNamespace, email: string): Promise<boolean> {
  const locked = await kv.get(LOCKOUT_KEY(email));
  return locked !== null;
}

async function recordFailedAttempt(kv: KVNamespace, email: string): Promise<number> {
  const raw = await kv.get(ATTEMPT_KEY(email));
  const current = raw ? parseInt(raw, 10) : 0;
  const next = current + 1;

  if (next >= MAX_OTP_ATTEMPTS) {
    // Lock the email and clear the attempt counter
    await kv.put(LOCKOUT_KEY(email), "1", { expirationTtl: LOCKOUT_TTL_SECONDS });
    await kv.delete(ATTEMPT_KEY(email));
    return next;
  }

  // Keep attempt window aligned with OTP TTL so stale attempts auto-expire
  await kv.put(ATTEMPT_KEY(email), String(next), { expirationTtl: OTP_TTL_SECONDS });
  return next;
}

async function clearAttempts(kv: KVNamespace, email: string): Promise<void> {
  await Promise.all([kv.delete(ATTEMPT_KEY(email)), kv.delete(LOCKOUT_KEY(email))]);
}

// ─── Resend cooldown ──────────────────────────────────────────────────────────

const RESEND_KEY = (email: string) => `otp:resend:${email}`;

async function isOnResendCooldown(kv: KVNamespace, email: string): Promise<boolean> {
  const entry = await kv.get(RESEND_KEY(email));
  return entry !== null;
}

async function setResendCooldown(kv: KVNamespace, email: string): Promise<void> {
  await kv.put(RESEND_KEY(email), "1", { expirationTtl: RESEND_COOLDOWN_SECONDS });
}

// ─── Email: Microsoft 365 via Graph API ───────────────────────────────────────

function hasMicrosoftGraphConfig(env: Env): boolean {
  return Boolean(env.MS_TENANT_ID && env.MS_CLIENT_ID && env.MS_CLIENT_SECRET);
}

async function getMicrosoftGraphToken(env: Env): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${env.MS_TENANT_ID}/oauth2/v2.0/token`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.MS_CLIENT_ID ?? "",
      client_secret: env.MS_CLIENT_SECRET ?? "",
      scope: "https://graph.microsoft.com/.default",
    }),
  });

  if (!response.ok) {
    throw new Error(`Microsoft 365 token error: ${await response.text()}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

function buildOtpEmailHtml(name: string, otpCode: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5fd;font-family:Arial,'Helvetica Neue',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5fd;padding:48px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#141929 0%,#1e2640 100%);padding:28px 32px;border-radius:16px 16px 0 0;text-align:center;">
            <div style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;font-weight:800;font-size:16px;padding:10px 20px;border-radius:10px;letter-spacing:-0.5px;">JK</div>
            <div style="color:rgba(255,255,255,0.5);font-size:11px;margin-top:8px;letter-spacing:1.5px;text-transform:uppercase;">JWithKP HRMS</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:white;padding:36px 32px;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
            <h1 style="margin:0 0 10px;font-size:22px;color:#0f172a;font-weight:800;letter-spacing:-0.5px;">Verify your email</h1>
            <p style="margin:0 0 28px;color:#64748b;line-height:1.75;font-size:14px;">
              Hi <strong style="color:#0f172a;">${name}</strong>, use the one-time code below to complete your
              JWithKP HRMS account registration.
            </p>

            <!-- OTP box -->
            <div style="background:#eef2ff;border:1.5px solid #c7d2fe;border-radius:14px;padding:22px;text-align:center;margin-bottom:24px;">
              <div style="font-size:38px;letter-spacing:12px;font-weight:800;color:#4f46e5;font-family:'Courier New',monospace;">${otpCode}</div>
            </div>

            <!-- Expiry note -->
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:28px;">
              <p style="margin:0;color:#64748b;font-size:12.5px;line-height:1.7;">
                This code expires in <strong style="color:#0f172a;">5 minutes</strong>.
                If you did not request this, you can safely ignore this email — your account has not been created.
              </p>
            </div>

            <hr style="border:none;border-top:1px solid #f1f5f9;margin-bottom:20px;">
            <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">
              Sent by JWithKP HRMS &nbsp;·&nbsp; info@jwithkp.com
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendEmailViaMicrosoftGraph(
  env: Env,
  input: SendSignupOtpInput,
  otpCode: string,
): Promise<void> {
  const token = await getMicrosoftGraphToken(env);
  const from = env.MS_FROM_EMAIL ?? "info@jwithkp.com";

  const mailPayload = {
    message: {
      subject: "Your JWithKP HRMS verification code",
      body: {
        contentType: "HTML",
        content: buildOtpEmailHtml(input.name, otpCode),
      },
      toRecipients: [{ emailAddress: { address: input.email } }],
    },
    saveToSentItems: false,
  };

  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${from}/sendMail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(mailPayload),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Microsoft Graph email error (${response.status}): ${detail}`);
  }
}

// ─── Email: legacy HTTP bridge (fallback) ─────────────────────────────────────

async function sendEmailViaLegacyBridge(
  env: Env,
  input: SendSignupOtpInput,
  otpCode: string,
): Promise<void> {
  if (!env.EMAIL_API_URL || !env.API_KEY) {
    throw new Error(
      "No email provider configured. Add MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET for Microsoft 365, " +
        "or EMAIL_API_URL / API_KEY for the legacy SMTP bridge.",
    );
  }

  const response = await fetch(env.EMAIL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.API_KEY}`,
      "x-api-key": env.API_KEY,
    },
    body: JSON.stringify({
      from: "info@jwithkp.com",
      to: input.email,
      subject: "Your JWithKP HRMS verification code",
      text: `Hi ${input.name}, your OTP is ${otpCode}. It expires in 5 minutes.`,
      html: buildOtpEmailHtml(input.name, otpCode),
    }),
  });

  if (!response.ok) {
    throw new Error(`Email bridge error: ${await response.text()}`);
  }
}

// ─── Email dispatcher ─────────────────────────────────────────────────────────

async function sendSignupOtpEmail(
  env: Env,
  input: SendSignupOtpInput,
  otpCode: string,
): Promise<void> {
  if (hasMicrosoftGraphConfig(env)) {
    return sendEmailViaMicrosoftGraph(env, input, otpCode);
  }
  return sendEmailViaLegacyBridge(env, input, otpCode);
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function handleSendSignupOtp(request: Request, env: Env): Promise<Response> {
  const input = await readJsonBody<SendSignupOtpInput>(request);
  if (!input) {
    return jsonResponse({ error: "Invalid JSON payload." }, 400);
  }

  const name = input.name?.trim();
  const email = normalizeEmail(input.email ?? "");
  const password = input.password?.trim();

  if (!name || !email || !password) {
    return jsonResponse({ error: "Name, email, and password are required." }, 400);
  }

  if (!isValidEmail(email)) {
    return jsonResponse({ error: "Please provide a valid email address." }, 400);
  }

  if (password.length < 8) {
    return jsonResponse({ error: "Password must be at least 8 characters." }, 400);
  }

  // Reject if currently locked out from too many OTP attempts
  if (await isLockedOut(env.OTP_STORE, email)) {
    return jsonResponse(
      { error: "Too many failed attempts. Please wait 15 minutes before requesting a new OTP." },
      429,
    );
  }

  // Enforce resend cooldown
  if (await isOnResendCooldown(env.OTP_STORE, email)) {
    return jsonResponse(
      { error: "Please wait 60 seconds before requesting another OTP." },
      429,
    );
  }

  await ensureAuthUsersTable(env.HRMS);

  const existingUser = await env.HRMS
    .prepare(`SELECT id FROM auth_users WHERE lower(email) = lower(?) LIMIT 1`)
    .bind(email)
    .first<{ id: number }>();

  if (existingUser) {
    return jsonResponse({ error: "An account with this email already exists." }, 409);
  }

  const otp = generateOtpCode();
  const pendingRecord: PendingSignupRecord = {
    otp,
    name,
    password: await hashPassword(password),
    createdAt: Date.now(),
  };

  await env.OTP_STORE.put(email, JSON.stringify(pendingRecord), {
    expirationTtl: OTP_TTL_SECONDS,
  });

  try {
    await sendSignupOtpEmail(env, { name, email, password }, otp);
  } catch (error) {
    await env.OTP_STORE.delete(email);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Failed to send OTP email." },
      502,
    );
  }

  // Start resend cooldown after successful send
  await setResendCooldown(env.OTP_STORE, email);

  return jsonResponse({ success: true });
}

async function handleVerifySignupOtp(request: Request, env: Env): Promise<Response> {
  const input = await readJsonBody<VerifySignupOtpInput>(request);
  if (!input) {
    return jsonResponse({ error: "Invalid JSON payload." }, 400);
  }

  const email = normalizeEmail(input.email ?? "");
  const otp = (input.otp ?? "").trim();

  if (!email || !otp) {
    return jsonResponse({ error: "Email and OTP are required." }, 400);
  }

  if (!isValidEmail(email)) {
    return jsonResponse({ error: "Please provide a valid email address." }, 400);
  }

  // Check lockout before doing anything
  if (await isLockedOut(env.OTP_STORE, email)) {
    return jsonResponse(
      { error: "Too many failed attempts. Please wait 15 minutes before trying again." },
      429,
    );
  }

  const pendingRaw = await env.OTP_STORE.get(email);
  if (!pendingRaw) {
    return jsonResponse(
      { error: "OTP expired or not found. Please request a new code." },
      400,
    );
  }

  let pendingData: PendingSignupRecord;
  try {
    pendingData = JSON.parse(pendingRaw) as PendingSignupRecord;
  } catch {
    await env.OTP_STORE.delete(email);
    return jsonResponse({ error: "OTP record is invalid. Please request a new code." }, 400);
  }

  if (pendingData.otp !== otp) {
    const attempts = await recordFailedAttempt(env.OTP_STORE, email);
    if (attempts >= MAX_OTP_ATTEMPTS) {
      return jsonResponse(
        { error: "Too many failed attempts. Your OTP has been invalidated. Please wait 15 minutes." },
        429,
      );
    }
    const remaining = MAX_OTP_ATTEMPTS - attempts;
    return jsonResponse(
      { error: `Invalid OTP. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` },
      400,
    );
  }

  // OTP is correct — create the user account
  await ensureAuthUsersTable(env.HRMS);

  const existingUser = await env.HRMS
    .prepare(`SELECT id FROM auth_users WHERE lower(email) = lower(?) LIMIT 1`)
    .bind(email)
    .first<{ id: number }>();

  if (existingUser) {
    await env.OTP_STORE.delete(email);
    return jsonResponse({ error: "An account with this email already exists." }, 409);
  }

  await env.HRMS
    .prepare(`INSERT INTO auth_users (name, email, password, is_verified) VALUES (?, ?, ?, 1)`)
    .bind(pendingData.name, email, pendingData.password)
    .run();

  // Clean up all OTP-related keys for this email
  await env.OTP_STORE.delete(email);
  await clearAttempts(env.OTP_STORE, email);

  return jsonResponse({ success: true });
}

// ─── Worker entry ─────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/send-signup-otp") {
      return handleSendSignupOtp(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/verify-signup-otp") {
      return handleVerifySignupOtp(request, env);
    }

    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<Env>;
