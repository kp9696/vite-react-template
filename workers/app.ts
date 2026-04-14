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

const JWT_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days
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

// ─── JWT (HS256 via WebCrypto) ────────────────────────────────────────────────

interface JwtPayload {
  sub: string;   // email
  name: string;
  exp: number;
  iat: number;
}

function base64UrlEncode(data: ArrayBuffer | string): string {
  const bytes = typeof data === "string"
    ? new TextEncoder().encode(data)
    : new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + "=".repeat(padLen));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
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

async function signJwt(payload: JwtPayload, secret: string): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const key = await getHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlEncode(sig)}`;
}

async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const signingInput = `${header}.${body}`;
  const key = await getHmacKey(secret);
  const valid = await crypto.subtle.verify("HMAC", key, base64UrlDecode(sig), new TextEncoder().encode(signingInput));
  if (!valid) return null;
  let payload: JwtPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as JwtPayload;
  } catch {
    return null;
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

async function extractBearerPayload(request: Request, secret: string): Promise<JwtPayload | null> {
  const auth = request.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return verifyJwt(auth.slice(7), secret);
}

// ─── Company helpers (used by Worker endpoints) ───────────────────────────────

async function getOrCreateCompany(
  db: D1Database,
  ownerEmail: string,
  companyName: string,
): Promise<{ id: string; company_name: string; plan: string; employee_limit: number }> {
  const existing = await db
    .prepare(`SELECT id, company_name, plan, employee_limit FROM companies WHERE owner_id = lower(?) LIMIT 1`)
    .bind(ownerEmail)
    .first<{ id: string; company_name: string; plan: string; employee_limit: number }>();
  if (existing) return existing;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO companies (id, owner_id, company_name, plan, employee_limit, created_at, updated_at)
       VALUES (?, lower(?), ?, 'free', 5, ?, ?)`,
    )
    .bind(id, ownerEmail, companyName, now, now)
    .run();
  return { id, company_name: companyName, plan: "free", employee_limit: 5 };
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

// ─── Email: Resend (primary) ──────────────────────────────────────────────────

async function sendEmailViaResend(
  env: Env,
  input: SendSignupOtpInput,
  otpCode: string,
): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.MS_FROM_EMAIL ?? "info@jwithkp.com",
      to: [input.email],
      subject: "Your JWithKP HRMS verification code",
      html: buildOtpEmailHtml(input.name, otpCode),
      text: `Hi ${input.name}, your OTP is ${otpCode}. It expires in 5 minutes.`,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend error (${response.status}): ${detail}`);
  }
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
// Priority: Resend → Microsoft Graph → Legacy bridge

async function sendSignupOtpEmail(
  env: Env,
  input: SendSignupOtpInput,
  otpCode: string,
): Promise<void> {
  if (env.RESEND_API_KEY) {
    return sendEmailViaResend(env, input, otpCode);
  }
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

  const now = new Date().toISOString();
  const userId = crypto.randomUUID();

  // Insert into auth_users (credentials store)
  await env.HRMS
    .prepare(`INSERT INTO auth_users (name, email, password, is_verified) VALUES (?, ?, ?, 1)`)
    .bind(pendingData.name, email, pendingData.password)
    .run();

  // Auto-create an organization (invite system) + company (SaaS) for the new admin
  const defaultOrgName = `${pendingData.name}'s Organization`;
  const domain = email.split("@")[1] ?? email;
  // For Gmail/free email, use email-scoped domain so multiple users can register
  const orgDomain = domain === "gmail.com" || domain === "yahoo.com" || domain === "outlook.com"
    ? `gmail:${email}`
    : domain;
  const orgId = `ORG${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;

  await env.HRMS
    .prepare(
      `INSERT OR IGNORE INTO organizations (id, name, domain, invite_limit, created_at, updated_at)
       VALUES (?, ?, ?, 5, ?, ?)`,
    )
    .bind(orgId, defaultOrgName, orgDomain, now, now)
    .run();

  // Get the actual org id (handles the OR IGNORE case where org already existed)
  const actualOrg = await env.HRMS
    .prepare(`SELECT id FROM organizations WHERE domain = ? LIMIT 1`)
    .bind(orgDomain)
    .first<{ id: string }>();
  const resolvedOrgId = actualOrg?.id ?? orgId;

  // Insert into users as HR Admin, linked to their org
  await env.HRMS
    .prepare(
      `INSERT OR IGNORE INTO users (id, org_id, name, email, role, department, status, joined_on, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'HR Admin', 'General', 'Active', ?, ?, ?)`,
    )
    .bind(userId, resolvedOrgId, pendingData.name, email, now, now, now)
    .run();

  // Also create a SaaS company record
  await getOrCreateCompany(env.HRMS, email, defaultOrgName);

  // Clean up all OTP-related keys for this email
  await env.OTP_STORE.delete(email);
  await clearAttempts(env.OTP_STORE, email);

  return jsonResponse({ success: true });
}

// ─── JWT API handlers ─────────────────────────────────────────────────────────

async function handleApiLogin(request: Request, env: Env): Promise<Response> {
  if (!env.JWT_SECRET) return jsonResponse({ error: "JWT_SECRET not configured." }, 500);
  const body = await readJsonBody<{ email: string; password: string }>(request);
  if (!body?.email || !body?.password) {
    return jsonResponse({ error: "Email and password are required." }, 400);
  }
  const email = normalizeEmail(body.email);
  const hash = await hashPassword(body.password);
  const user = await env.HRMS
    .prepare(`SELECT name FROM auth_users WHERE lower(email)=? AND password=? AND is_verified=1 LIMIT 1`)
    .bind(email, hash)
    .first<{ name: string }>();
  if (!user) return jsonResponse({ error: "Invalid credentials." }, 401);

  const now = Math.floor(Date.now() / 1000);
  const token = await signJwt({ sub: email, name: user.name, iat: now, exp: now + JWT_EXPIRY_SECONDS }, env.JWT_SECRET);
  return jsonResponse({ token, name: user.name, email });
}

async function handleApiGetCompany(request: Request, env: Env): Promise<Response> {
  if (!env.JWT_SECRET) return jsonResponse({ error: "JWT_SECRET not configured." }, 500);
  const payload = await extractBearerPayload(request, env.JWT_SECRET);
  if (!payload) return jsonResponse({ error: "Unauthorized." }, 401);

  const company = await env.HRMS
    .prepare(`SELECT id, company_name, plan, employee_limit FROM companies WHERE owner_id=? LIMIT 1`)
    .bind(payload.sub)
    .first<{ id: string; company_name: string; plan: string; employee_limit: number }>();
  if (!company) return jsonResponse({ error: "Company not found." }, 404);

  const count = await env.HRMS
    .prepare(`SELECT COUNT(*) as cnt FROM saas_employees WHERE company_id=?`)
    .bind(company.id)
    .first<{ cnt: number }>();

  return jsonResponse({ ...company, employee_count: count?.cnt ?? 0 });
}

async function handleApiGetEmployees(request: Request, env: Env): Promise<Response> {
  if (!env.JWT_SECRET) return jsonResponse({ error: "JWT_SECRET not configured." }, 500);
  const payload = await extractBearerPayload(request, env.JWT_SECRET);
  if (!payload) return jsonResponse({ error: "Unauthorized." }, 401);

  const company = await env.HRMS
    .prepare(`SELECT id FROM companies WHERE owner_id=? LIMIT 1`)
    .bind(payload.sub)
    .first<{ id: string }>();
  if (!company) return jsonResponse({ error: "Company not found." }, 404);

  const result = await env.HRMS
    .prepare(`SELECT * FROM saas_employees WHERE company_id=? ORDER BY created_at DESC`)
    .bind(company.id)
    .all();
  return jsonResponse({ employees: result.results });
}

async function handleApiAddEmployee(request: Request, env: Env): Promise<Response> {
  if (!env.JWT_SECRET) return jsonResponse({ error: "JWT_SECRET not configured." }, 500);
  const payload = await extractBearerPayload(request, env.JWT_SECRET);
  if (!payload) return jsonResponse({ error: "Unauthorized." }, 401);

  const body = await readJsonBody<{ name: string; email: string; role?: string; department?: string }>(request);
  if (!body?.name || !body?.email) return jsonResponse({ error: "Name and email are required." }, 400);
  if (!isValidEmail(body.email)) return jsonResponse({ error: "Invalid email address." }, 400);

  const company = await env.HRMS
    .prepare(`SELECT id, employee_limit FROM companies WHERE owner_id=? LIMIT 1`)
    .bind(payload.sub)
    .first<{ id: string; employee_limit: number }>();
  if (!company) return jsonResponse({ error: "Company not found." }, 404);

  const count = await env.HRMS
    .prepare(`SELECT COUNT(*) as cnt FROM saas_employees WHERE company_id=?`)
    .bind(company.id)
    .first<{ cnt: number }>();
  const current = count?.cnt ?? 0;
  if (current >= company.employee_limit) {
    return jsonResponse(
      { error: `Employee limit reached (${company.employee_limit} on your plan). Upgrade to add more.` },
      403,
    );
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.HRMS
      .prepare(
        `INSERT INTO saas_employees (id, company_id, name, email, role, department, status, joined_on, created_at)
         VALUES (?, ?, ?, lower(?), ?, ?, 'Active', ?, ?)`,
      )
      .bind(id, company.id, body.name.trim(), body.email, body.role?.trim() || "Employee", body.department?.trim() || "General", now, now)
      .run();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE")) return jsonResponse({ error: "This email is already added to your company." }, 409);
    return jsonResponse({ error: "Failed to add employee." }, 500);
  }

  return jsonResponse({ ok: true, id, name: body.name.trim(), email: body.email.toLowerCase() }, 201);
}

async function handleApiDeleteEmployee(employeeId: string, request: Request, env: Env): Promise<Response> {
  if (!env.JWT_SECRET) return jsonResponse({ error: "JWT_SECRET not configured." }, 500);
  const payload = await extractBearerPayload(request, env.JWT_SECRET);
  if (!payload) return jsonResponse({ error: "Unauthorized." }, 401);

  const company = await env.HRMS
    .prepare(`SELECT id FROM companies WHERE owner_id=? LIMIT 1`)
    .bind(payload.sub)
    .first<{ id: string }>();
  if (!company) return jsonResponse({ error: "Company not found." }, 404);

  const result = await env.HRMS
    .prepare(`DELETE FROM saas_employees WHERE id=? AND company_id=?`)
    .bind(employeeId, company.id)
    .run();
  if ((result.meta.changes ?? 0) === 0) return jsonResponse({ error: "Employee not found." }, 404);
  return jsonResponse({ ok: true });
}

// ─── Worker entry ─────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { method, pathname } = { method: request.method, pathname: url.pathname };

    // CORS preflight for API routes
    if (method === "OPTIONS" && pathname.startsWith("/api/")) {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
      });
    }

    // OTP signup flow
    if (method === "POST" && pathname === "/api/send-signup-otp") return handleSendSignupOtp(request, env);
    if (method === "POST" && pathname === "/api/verify-signup-otp") return handleVerifySignupOtp(request, env);

    // JWT auth
    if (method === "POST" && pathname === "/api/auth/login") return handleApiLogin(request, env);

    // Company
    if (method === "GET" && pathname === "/api/company") return handleApiGetCompany(request, env);

    // Employees
    if (method === "GET" && pathname === "/api/employees") return handleApiGetEmployees(request, env);
    if (method === "POST" && pathname === "/api/employees") return handleApiAddEmployee(request, env);

    // DELETE /api/employees/:id
    const deleteMatch = pathname.match(/^\/api\/employees\/([^/]+)$/);
    if (method === "DELETE" && deleteMatch) return handleApiDeleteEmployee(deleteMatch[1], request, env);

    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<Env>;
