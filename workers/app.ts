import { createRequestHandler } from "react-router";
import {
  buildRefreshCookie,
  clearRefreshCookie,
  createAccessToken,
  hashPassword,
  parseCookieHeader,
  requireAuth,
  verifyPasswordWithMigration,
} from "./security/auth";
import { handleCorsPreflight, withCors } from "./security/cors";
import { enforceLoginRateLimit, enforceOtpIpRateLimit, extractClientIp } from "./security/rateLimiter";
import {
  clearOtpAttemptState,
  clearResetOtpState,
  deletePendingOtp,
  deleteResetOtp,
  generateOtpCode,
  getOtpAttemptBudget,
  isEmailLockedForOtp,
  isResetEmailLocked,
  isResetResendCoolingDown,
  isResendCoolingDown,
  readPendingOtp,
  readResetOtp,
  recordOtpVerifyFailure,
  recordResetOtpFailure,
  saveResetOtp,
  savePendingOtp,
  startResendCooldown,
  startResetResendCooldown,
} from "./security/otp";
import {
  createRefreshTokenRecord,
  findActiveRefreshTokenByHash,
  generateOpaqueRefreshToken,
  isRefreshTokenUsable,
  logAuthEvent,
  revokeRefreshTokenByHash,
  revokeRefreshTokenById,
  sha256Hex,
} from "./security/refreshTokens";
import { handleCoreHrmsApi } from "./modules/hrms-core";
import { handleSchemaCoreApi } from "./modules/hrms-schema-api";

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

interface SendSignupOtpInput {
  name: string;
  companyName: string;
  email: string;
  password: string;
}

interface VerifySignupOtpInput {
  email: string;
  otp: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function apiJson(
  request: Request,
  env: Env,
  payload: Record<string, unknown>,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  const headers = new Headers({ "Content-Type": "application/json", ...extraHeaders });
  return withCors(
    new Response(JSON.stringify(payload), {
      status,
      headers,
    }),
    request,
    env,
  );
}

function getRequestUserAgent(request: Request): string {
  return request.headers.get("User-Agent") || "unknown";
}

async function getTokenFingerprint(request: Request): Promise<string> {
  const ip = extractClientIp(request);
  const ua = getRequestUserAgent(request);
  return sha256Hex(`${ip}|${ua}`);
}

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

async function usersTableHasOrgId(db: D1Database): Promise<boolean> {
  try {
    const column = await db
      .prepare(`SELECT 1 AS has_col FROM pragma_table_info('users') WHERE name = 'org_id' LIMIT 1`)
      .first<{ has_col: number }>();
    return Boolean(column?.has_col);
  } catch {
    return false;
  }
}

async function usersTableHasCompanyId(db: D1Database): Promise<boolean> {
  try {
    const column = await db
      .prepare(`SELECT 1 AS has_col FROM pragma_table_info('users') WHERE name = 'company_id' LIMIT 1`)
      .first<{ has_col: number }>();
    return Boolean(column?.has_col);
  } catch {
    return false;
  }
}

async function getOrCreateCompany(
  db: D1Database,
  ownerEmail: string,
  companyName: string,
): Promise<{ id: string; company_name: string; plan: string; employee_limit: number }> {
  const existing = await db
    .prepare(`SELECT id, company_name, plan, employee_limit FROM companies WHERE owner_id = lower(?) LIMIT 1`)
    .bind(ownerEmail)
    .first<{ id: string; company_name: string; plan: string; employee_limit: number }>();

  if (existing) {
    return existing;
  }

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
        <tr>
          <td style="background:linear-gradient(135deg,#141929 0%,#1e2640 100%);padding:28px 32px;border-radius:16px 16px 0 0;text-align:center;">
            <div style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;font-weight:800;font-size:16px;padding:10px 20px;border-radius:10px;">JK</div>
            <div style="color:rgba(255,255,255,0.5);font-size:11px;margin-top:8px;letter-spacing:1.5px;text-transform:uppercase;">JWithKP HRMS</div>
          </td>
        </tr>
        <tr>
          <td style="background:white;padding:36px 32px;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
            <h1 style="margin:0 0 10px;font-size:22px;color:#0f172a;font-weight:800;">Verify your email</h1>
            <p style="margin:0 0 28px;color:#64748b;line-height:1.75;font-size:14px;">Hi <strong>${name}</strong>, use the one-time code below to complete your account registration.</p>
            <div style="background:#eef2ff;border:1.5px solid #c7d2fe;border-radius:14px;padding:22px;text-align:center;margin-bottom:24px;">
              <div style="font-size:38px;letter-spacing:12px;font-weight:800;color:#4f46e5;font-family:'Courier New',monospace;">${otpCode}</div>
            </div>
            <p style="margin:0;color:#64748b;font-size:12.5px;line-height:1.7;">This code expires in <strong>5 minutes</strong>.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildResetEmailHtml(name: string, otpCode: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5fd;font-family:Arial,'Helvetica Neue',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5fd;padding:48px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:linear-gradient(135deg,#141929 0%,#1e2640 100%);padding:28px 32px;border-radius:16px 16px 0 0;text-align:center;">
            <div style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;font-weight:800;font-size:16px;padding:10px 20px;border-radius:10px;">JK</div>
            <div style="color:rgba(255,255,255,0.5);font-size:11px;margin-top:8px;letter-spacing:1.5px;text-transform:uppercase;">JWithKP HRMS</div>
          </td>
        </tr>
        <tr>
          <td style="background:white;padding:36px 32px;border-radius:0 0 16px 16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
            <h1 style="margin:0 0 10px;font-size:22px;color:#0f172a;font-weight:800;">Reset your password</h1>
            <p style="margin:0 0 28px;color:#64748b;line-height:1.75;font-size:14px;">Hi <strong>${name}</strong>, use the one-time code below to reset your JWithKP HRMS password. If you did not request this, you can safely ignore this email.</p>
            <div style="background:#eef2ff;border:1.5px solid #c7d2fe;border-radius:14px;padding:22px;text-align:center;margin-bottom:24px;">
              <div style="font-size:38px;letter-spacing:12px;font-weight:800;color:#4f46e5;font-family:'Courier New',monospace;">${otpCode}</div>
            </div>
            <p style="margin:0;color:#64748b;font-size:12.5px;line-height:1.7;">This code expires in <strong>5 minutes</strong>.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendResetPasswordEmail(
  env: Env,
  name: string,
  email: string,
  otpCode: string,
): Promise<void> {
  const subject = "Your JWithKP HRMS password reset code";
  const html = buildResetEmailHtml(name, otpCode);
  const text = `Hi ${name}, your password reset code is ${otpCode}. It expires in 5 minutes. If you did not request this, please ignore this email.`;

  if (env.RESEND_API_KEY) {
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.MS_FROM_EMAIL ?? "info@jwithkp.com",
        to: [email],
        subject,
        html,
        text,
      }),
    });

    if (!resendResponse.ok) {
      throw new Error(`Resend error: ${await resendResponse.text()}`);
    }
    return;
  }

  if (hasMicrosoftGraphConfig(env)) {
    const token = await getMicrosoftGraphToken(env);
    const from = env.MS_FROM_EMAIL ?? "info@jwithkp.com";

    const response = await fetch(`https://graph.microsoft.com/v1.0/users/${from}/sendMail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: html },
          toRecipients: [{ emailAddress: { address: email } }],
        },
        saveToSentItems: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Microsoft Graph email error: ${await response.text()}`);
    }
    return;
  }

  if (!env.EMAIL_API_URL || !env.API_KEY) {
    throw new Error("No email provider configured.");
  }

  const bridgeResponse = await fetch(env.EMAIL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.API_KEY}`,
      "x-api-key": env.API_KEY,
    },
    body: JSON.stringify({
      from: "info@jwithkp.com",
      to: email,
      subject,
      text,
      html,
    }),
  });

  if (!bridgeResponse.ok) {
    throw new Error(`Email bridge error: ${await bridgeResponse.text()}`);
  }
}

async function sendSignupOtpEmail(
  env: Env,
  input: SendSignupOtpInput,
  otpCode: string,
): Promise<void> {
  if (env.RESEND_API_KEY) {
    const resendResponse = await fetch("https://api.resend.com/emails", {
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

    if (!resendResponse.ok) {
      throw new Error(`Resend error: ${await resendResponse.text()}`);
    }
    return;
  }

  if (hasMicrosoftGraphConfig(env)) {
    const token = await getMicrosoftGraphToken(env);
    const from = env.MS_FROM_EMAIL ?? "info@jwithkp.com";

    const response = await fetch(`https://graph.microsoft.com/v1.0/users/${from}/sendMail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: "Your JWithKP HRMS verification code",
          body: {
            contentType: "HTML",
            content: buildOtpEmailHtml(input.name, otpCode),
          },
          toRecipients: [{ emailAddress: { address: input.email } }],
        },
        saveToSentItems: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Microsoft Graph email error: ${await response.text()}`);
    }
    return;
  }

  if (!env.EMAIL_API_URL || !env.API_KEY) {
    throw new Error("No email provider configured.");
  }

  const bridgeResponse = await fetch(env.EMAIL_API_URL, {
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

  if (!bridgeResponse.ok) {
    throw new Error(`Email bridge error: ${await bridgeResponse.text()}`);
  }
}

async function requireApiAuth(request: Request, env: Env) {
  const accessSecret = env.JWT_ACCESS_SECRET ?? env.JWT_SECRET;
  if (!accessSecret) {
    return null;
  }
  return requireAuth(request, accessSecret);
}

async function handleSendSignupOtp(request: Request, env: Env): Promise<Response> {
  const ip = extractClientIp(request);
  const ipLimit = await enforceOtpIpRateLimit(env.OTP_STORE, ip);
  if (!ipLimit.ok) {
    return apiJson(request, env, { error: ipLimit.message }, 429, {
      "Retry-After": String(ipLimit.retryAfter),
    });
  }

  const body = await readJsonBody<SendSignupOtpInput>(request);
  if (!body) {
    return apiJson(request, env, { error: "Invalid JSON payload." }, 400);
  }

  const name = body.name?.trim();
  const companyName = body.companyName?.trim();
  const email = normalizeEmail(body.email ?? "");
  const password = body.password?.trim() ?? "";

  if (!name || !companyName || !email || !password) {
    return apiJson(request, env, { error: "Company name, admin name, email, and password are required." }, 400);
  }

  if (!isValidEmail(email)) {
    return apiJson(request, env, { error: "Please provide a valid email address." }, 400);
  }

  if (password.length < 8) {
    return apiJson(request, env, { error: "Password must be at least 8 characters." }, 400);
  }

  if (await isEmailLockedForOtp(env.OTP_STORE, email)) {
    return apiJson(request, env, { error: "Too many OTP failures. Please wait before trying again." }, 429);
  }

  if (await isResendCoolingDown(env.OTP_STORE, email)) {
    return apiJson(request, env, { error: "Please wait before requesting another OTP." }, 429);
  }

  await ensureAuthUsersTable(env.HRMS);

  const existing = await env.HRMS
    .prepare(`SELECT id FROM auth_users WHERE lower(email) = lower(?) LIMIT 1`)
    .bind(email)
    .first<{ id: number }>();

  if (existing) {
    return apiJson(request, env, { error: "Email already registered." }, 409);
  }

  const otp = generateOtpCode();
  const passwordHash = await hashPassword(password);

  await savePendingOtp(env.OTP_STORE, email, {
    otp,
    name,
    companyName,
    passwordHash,
    createdAt: Date.now(),
  });

  try {
    await sendSignupOtpEmail(env, { name, companyName, email, password }, otp);
  } catch (error) {
    await deletePendingOtp(env.OTP_STORE, email);
    return apiJson(
      request,
      env,
      { error: error instanceof Error ? error.message : "Failed to send OTP." },
      502,
    );
  }

  await startResendCooldown(env.OTP_STORE, email);
  return apiJson(request, env, { success: true });
}

async function handleVerifySignupOtp(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody<VerifySignupOtpInput>(request);
  if (!body) {
    return apiJson(request, env, { error: "Invalid JSON payload." }, 400);
  }

  const email = normalizeEmail(body.email ?? "");
  const otp = (body.otp ?? "").trim();

  if (!email || !otp) {
    return apiJson(request, env, { error: "Email and OTP are required." }, 400);
  }

  if (!isValidEmail(email)) {
    return apiJson(request, env, { error: "Please provide a valid email address." }, 400);
  }

  if (await isEmailLockedForOtp(env.OTP_STORE, email)) {
    return apiJson(request, env, { error: "Too many OTP failures. Please wait before retrying." }, 429);
  }

  const pending = await readPendingOtp(env.OTP_STORE, email);
  if (!pending) {
    return apiJson(request, env, { error: "OTP expired or not found. Request a new code." }, 400);
  }

  if (pending.otp !== otp) {
    const attempts = await recordOtpVerifyFailure(env.OTP_STORE, email);
    const remaining = Math.max(getOtpAttemptBudget() - attempts, 0);

    if (remaining === 0) {
      await deletePendingOtp(env.OTP_STORE, email);
      return apiJson(request, env, { error: "Too many invalid OTP attempts. Please request a new OTP later." }, 429);
    }

    return apiJson(request, env, { error: `Invalid OTP. ${remaining} attempts remaining.` }, 400);
  }

  await ensureAuthUsersTable(env.HRMS);

  const alreadyRegistered = await env.HRMS
    .prepare(`SELECT id FROM auth_users WHERE lower(email) = lower(?) LIMIT 1`)
    .bind(email)
    .first<{ id: number }>();

  if (alreadyRegistered) {
    await deletePendingOtp(env.OTP_STORE, email);
    await clearOtpAttemptState(env.OTP_STORE, email);
    return apiJson(request, env, { error: "Email already registered." }, 409);
  }

  const now = new Date().toISOString();
  const authInsert = await env.HRMS
    .prepare(`INSERT INTO auth_users (name, email, password, is_verified) VALUES (?, ?, ?, 1)`)
    .bind(pending.name, email, pending.passwordHash)
    .run()
    .catch((err) => ({ error: err }));

  if ("error" in authInsert) {
    const msg = authInsert.error instanceof Error ? authInsert.error.message : "Failed to create account.";
    const status = msg.includes("UNIQUE") ? 409 : 500;
    return apiJson(request, env, { error: status === 409 ? "Email already registered." : "Failed to create account." }, status);
  }

  const domain = email.split("@")[1] ?? email;
  const orgDomain = domain === "gmail.com" || domain === "yahoo.com" || domain === "outlook.com"
    ? `gmail:${email}`
    : domain;

  let companyId: string;
  const existingOrg = await env.HRMS
    .prepare(`SELECT id FROM organizations WHERE domain = ? LIMIT 1`)
    .bind(orgDomain)
    .first<{ id: string }>();

  if (existingOrg) {
    companyId = existingOrg.id;
  } else {
    companyId = `ORG${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const orgInsert = await env.HRMS
      .prepare(
        `INSERT INTO organizations (id, name, domain, invite_limit, created_at, updated_at)
         VALUES (?, ?, ?, 5, ?, ?)`,
      )
      .bind(companyId, pending.companyName, orgDomain, now, now)
      .run()
      .catch((err) => ({ error: err }));

    if ("error" in orgInsert) {
      await env.HRMS.prepare(`DELETE FROM auth_users WHERE lower(email) = lower(?)`).bind(email).run();
      return apiJson(request, env, { error: "Failed to create organization." }, 500);
    }
  }

  const userId = `USR${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const hasCompanyId = await usersTableHasCompanyId(env.HRMS);
  const hasOrgId = await usersTableHasOrgId(env.HRMS);
  const userInsert = (hasCompanyId || hasOrgId)
    ? await env.HRMS
      .prepare(
        `INSERT INTO users (id, company_id, org_id, name, email, role, department, status, joined_on, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'HR Admin', 'General', 'Active', ?, ?, ?)`,
      )
      .bind(userId, companyId, companyId, pending.name, email, now, now, now)
      .run()
      .catch((err) => ({ error: err }))
    : await env.HRMS
      .prepare(
        `INSERT INTO users (id, name, email, role, department, status, joined_on, created_at, updated_at)
         VALUES (?, ?, ?, 'HR Admin', 'General', 'Active', ?, ?, ?)`,
      )
      .bind(userId, pending.name, email, now, now, now)
      .run()
      .catch((err) => ({ error: err }));

  if ("error" in userInsert) {
    await env.HRMS.prepare(`DELETE FROM auth_users WHERE lower(email) = lower(?)`).bind(email).run();
    const msg = userInsert.error instanceof Error ? userInsert.error.message : "Failed to create HRMS profile.";
    if (msg.includes("UNIQUE")) {
      return apiJson(request, env, { error: "Email already exists in HRMS users. Please sign in." }, 409);
    }
    return apiJson(request, env, { error: "Failed to create HRMS profile." }, 500);
  }

  await getOrCreateCompany(env.HRMS, email, pending.companyName);
  await deletePendingOtp(env.OTP_STORE, email);
  await clearOtpAttemptState(env.OTP_STORE, email);

  return apiJson(request, env, { success: true });
}

async function handleApiLogin(request: Request, env: Env): Promise<Response> {
  try {
  const accessSecret = env.JWT_ACCESS_SECRET ?? env.JWT_SECRET;
  if (!accessSecret) {
    return apiJson(request, env, { error: "JWT access secret is not configured." }, 500);
  }

  const body = await readJsonBody<{ email: string; password: string }>(request);
  if (!body?.email || !body?.password) {
    return apiJson(request, env, { error: "Email and password are required." }, 400);
  }

  const email = normalizeEmail(body.email);
  const ip = extractClientIp(request);
  const userAgent = getRequestUserAgent(request);

  const limited = await enforceLoginRateLimit(env.OTP_STORE, ip, email);
  if (!limited.ok) {
    return apiJson(request, env, { error: limited.message }, 429, {
      "Retry-After": String(limited.retryAfter),
    });
  }

  const authUser = await env.HRMS
    .prepare(`SELECT name, password, is_verified FROM auth_users WHERE lower(email) = lower(?) LIMIT 1`)
    .bind(email)
    .first<{ name: string; password: string; is_verified: number }>();

  if (!authUser || authUser.is_verified !== 1) {
    return apiJson(request, env, { error: "Invalid credentials." }, 401);
  }

  const hasCompanyId = await usersTableHasCompanyId(env.HRMS);
  const hasOrgId = await usersTableHasOrgId(env.HRMS);
  const hrUser = hasCompanyId
    ? await env.HRMS
      .prepare(`SELECT id, company_id, org_id, role FROM users WHERE lower(email) = lower(?) LIMIT 1`)
      .bind(email)
      .first<{ id: string; company_id: string | null; org_id: string | null; role: string }>()
    : hasOrgId
    ? await env.HRMS
      .prepare(`SELECT id, org_id, role FROM users WHERE lower(email) = lower(?) LIMIT 1`)
      .bind(email)
      .first<{ id: string; org_id: string | null; role: string }>()
      .then((row) => row ? ({ ...row, company_id: row.org_id ?? null }) : null)
    : await env.HRMS
      .prepare(`SELECT id, role FROM users WHERE lower(email) = lower(?) LIMIT 1`)
      .bind(email)
      .first<{ id: string; role: string }>()
      .then((row) => row ? ({ ...row, org_id: null, company_id: null }) : null);

  if (!hrUser) {
    return apiJson(request, env, { error: "User profile is missing. Contact support." }, 403);
  }

  const passwordOk = await verifyPasswordWithMigration(env.HRMS, email, body.password, authUser.password);
  if (!passwordOk) {
    return apiJson(request, env, { error: "Invalid credentials." }, 401);
  }

  const tenantId = hrUser.company_id ?? hrUser.org_id ?? "NO_TENANT";
  const accessToken = await createAccessToken(
    email,
    authUser.name,
    hrUser.id,
    tenantId,
    hrUser.role,
    accessSecret,
  );

  const refreshToken = generateOpaqueRefreshToken();
  const refreshHash = await sha256Hex(refreshToken);
  const fingerprint = await getTokenFingerprint(request);
  await createRefreshTokenRecord(env.HRMS, {
    userId: hrUser.id,
    tokenHash: refreshHash,
    fingerprint,
  });

  try {
    await logAuthEvent(env.HRMS, "login", hrUser.id, ip, userAgent, "User login successful");
  } catch {
    // non-critical — don't fail login if audit log insert fails
  }

  return apiJson(
    request,
    env,
    {
      accessToken,
      tokenType: "Bearer",
      expiresIn: 900,
      user: {
        email,
        name: authUser.name,
        user_id: hrUser.id,
        tenant_id: tenantId,
        role: hrUser.role,
      },
    },
    200,
    {
      "Set-Cookie": buildRefreshCookie(refreshToken, request.url),
    },
  );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return apiJson(request, env, { error: `Login failed: ${msg}` }, 500);
  }
}

async function handleApiRefresh(request: Request, env: Env): Promise<Response> {
  const accessSecret = env.JWT_ACCESS_SECRET ?? env.JWT_SECRET;
  if (!accessSecret) {
    return apiJson(request, env, { error: "JWT access secret is not configured." }, 500);
  }

  const cookies = parseCookieHeader(request.headers.get("Cookie"));
  const refreshToken = cookies.refresh_token;
  if (!refreshToken) {
    return apiJson(request, env, { error: "Refresh token missing." }, 401);
  }

  const tokenHash = await sha256Hex(refreshToken);
  const tokenRow = await findActiveRefreshTokenByHash(env.HRMS, tokenHash);
  if (!isRefreshTokenUsable(tokenRow)) {
    await revokeRefreshTokenByHash(env.HRMS, tokenHash);
    return apiJson(request, env, { error: "Invalid refresh token." }, 401, {
      "Set-Cookie": clearRefreshCookie(request.url),
    });
  }

  const currentFingerprint = await getTokenFingerprint(request);
  if (tokenRow?.fingerprint && tokenRow.fingerprint !== currentFingerprint) {
    await revokeRefreshTokenById(env.HRMS, tokenRow.id);
    await logAuthEvent(
      env.HRMS,
      "refresh",
      tokenRow.user_id,
      extractClientIp(request),
      getRequestUserAgent(request),
      "Refresh rejected due to fingerprint mismatch",
    );
    return apiJson(request, env, { error: "Token fingerprint mismatch." }, 401, {
      "Set-Cookie": clearRefreshCookie(request.url),
    });
  }

  const user = await env.HRMS
    .prepare(
      `SELECT users.id, users.company_id, users.org_id, users.role, users.email, auth_users.name
       FROM users
       JOIN auth_users ON lower(auth_users.email) = lower(users.email)
       WHERE users.id = ?
       LIMIT 1`,
    )
    .bind(tokenRow?.user_id)
    .first<{ id: string; company_id: string | null; org_id: string | null; role: string; email: string; name: string }>();

  if (!user) {
    await revokeRefreshTokenById(env.HRMS, tokenRow!.id);
    return apiJson(request, env, { error: "User no longer exists." }, 401, {
      "Set-Cookie": clearRefreshCookie(request.url),
    });
  }

  await revokeRefreshTokenById(env.HRMS, tokenRow!.id);
  const rotatedRaw = generateOpaqueRefreshToken();
  const rotatedHash = await sha256Hex(rotatedRaw);
  await createRefreshTokenRecord(env.HRMS, {
    userId: user.id,
    tokenHash: rotatedHash,
    fingerprint: currentFingerprint,
  });

  const accessToken = await createAccessToken(
    normalizeEmail(user.email),
    user.name,
    user.id,
    user.company_id ?? user.org_id ?? "NO_TENANT",
    user.role,
    accessSecret,
  );

  await logAuthEvent(
    env.HRMS,
    "refresh",
    user.id,
    extractClientIp(request),
    getRequestUserAgent(request),
    "Refresh token rotated",
  );

  return apiJson(
    request,
    env,
    {
      accessToken,
      tokenType: "Bearer",
      expiresIn: 900,
      user: {
        email: normalizeEmail(user.email),
        name: user.name,
        user_id: user.id,
        tenant_id: user.company_id ?? user.org_id ?? "NO_TENANT",
        role: user.role,
      },
    },
    200,
    {
      "Set-Cookie": buildRefreshCookie(rotatedRaw, request.url),
    },
  );
}

async function handleApiLogout(request: Request, env: Env): Promise<Response> {
  const cookies = parseCookieHeader(request.headers.get("Cookie"));
  const raw = cookies.refresh_token;

  let userId: string | null = null;
  if (raw) {
    const hash = await sha256Hex(raw);
    const token = await findActiveRefreshTokenByHash(env.HRMS, hash);
    if (token) {
      userId = token.user_id;
      await revokeRefreshTokenById(env.HRMS, token.id);
    }
  }

  await logAuthEvent(
    env.HRMS,
    "logout",
    userId,
    extractClientIp(request),
    getRequestUserAgent(request),
    "User logged out",
  );

  return apiJson(request, env, { success: true }, 200, {
    "Set-Cookie": clearRefreshCookie(request.url),
  });
}

async function handleApiGetCompany(request: Request, env: Env): Promise<Response> {
  const auth = await requireApiAuth(request, env);
  if (!auth) {
    return apiJson(request, env, { error: "Unauthorized." }, 401);
  }

  const company = await env.HRMS
    .prepare(`SELECT id, company_name, plan, employee_limit FROM companies WHERE owner_id = ? LIMIT 1`)
    .bind(auth.email)
    .first<{ id: string; company_name: string; plan: string; employee_limit: number }>();

  if (!company) {
    return apiJson(request, env, { error: "Company not found." }, 404);
  }

  const count = await env.HRMS
    .prepare(`SELECT COUNT(*) as cnt FROM saas_employees WHERE company_id = ?`)
    .bind(company.id)
    .first<{ cnt: number }>();

  return apiJson(request, env, { ...company, employee_count: count?.cnt ?? 0 });
}

async function handleApiCompanyUsage(request: Request, env: Env): Promise<Response> {
  const auth = await requireApiAuth(request, env);
  if (!auth) {
    return apiJson(request, env, { error: "Unauthorized." }, 401);
  }

  const company = await env.HRMS
    .prepare(
      `SELECT id, plan, employee_limit, subscription_status
       FROM companies WHERE owner_id = ? LIMIT 1`,
    )
    .bind(auth.email)
    .first<{ id: string; plan: string; employee_limit: number; subscription_status: string }>();

  if (!company) {
    return apiJson(request, env, { error: "Company not found." }, 404);
  }

  const countRow = await env.HRMS
    .prepare(`SELECT COUNT(*) as cnt FROM saas_employees WHERE company_id = ?`)
    .bind(company.id)
    .first<{ cnt: number }>();

  const total_employees = countRow?.cnt ?? 0;
  const remaining_slots = Math.max(company.employee_limit - total_employees, 0);

  return apiJson(request, env, {
    total_employees,
    employee_limit: company.employee_limit,
    remaining_slots,
    plan: company.plan,
    subscription_status: company.subscription_status,
  });
}

async function handleApiGetEmployees(request: Request, env: Env): Promise<Response> {
  const auth = await requireApiAuth(request, env);
  if (!auth) {
    return apiJson(request, env, { error: "Unauthorized." }, 401);
  }

  const company = await env.HRMS
    .prepare(`SELECT id FROM companies WHERE owner_id = ? LIMIT 1`)
    .bind(auth.email)
    .first<{ id: string }>();

  if (!company) {
    return apiJson(request, env, { error: "Company not found." }, 404);
  }

  const result = await env.HRMS
    .prepare(`SELECT * FROM saas_employees WHERE company_id = ? ORDER BY created_at DESC`)
    .bind(company.id)
    .all();

  return apiJson(request, env, { employees: result.results });
}

async function handleApiAddEmployee(request: Request, env: Env): Promise<Response> {
  const auth = await requireApiAuth(request, env);
  if (!auth) {
    return apiJson(request, env, { error: "Unauthorized." }, 401);
  }

  const body = await readJsonBody<{ name: string; email: string; role?: string; department?: string }>(request);
  if (!body?.name || !body?.email) {
    return apiJson(request, env, { error: "Name and email are required." }, 400);
  }

  if (!isValidEmail(body.email)) {
    return apiJson(request, env, { error: "Invalid email address." }, 400);
  }

  const company = await env.HRMS
    .prepare(
      `SELECT id, plan, employee_limit, subscription_status
       FROM companies WHERE owner_id = ? LIMIT 1`,
    )
    .bind(auth.email)
    .first<{ id: string; plan: string; employee_limit: number; subscription_status: string }>();

  if (!company) {
    return apiJson(request, env, { error: "Company not found." }, 404);
  }

  if (company.subscription_status !== "active") {
    return apiJson(request, env, { error: "Subscription inactive. Please renew to add employees." }, 400);
  }

  const countRow = await env.HRMS
    .prepare(`SELECT COUNT(*) as cnt FROM saas_employees WHERE company_id = ?`)
    .bind(company.id)
    .first<{ cnt: number }>();

  const current = countRow?.cnt ?? 0;
  if (company.plan === "free" && current >= company.employee_limit) {
    return apiJson(
      request,
      env,
      { error: "Employee limit reached. Upgrade to add more employees." },
      400,
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
      .bind(
        id,
        company.id,
        body.name.trim(),
        body.email,
        body.role?.trim() || "Employee",
        body.department?.trim() || "General",
        now,
        now,
      )
      .run();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("UNIQUE")) {
      return apiJson(request, env, { error: "This email is already added to your company." }, 409);
    }
    return apiJson(request, env, { error: "Failed to add employee." }, 500);
  }

  return apiJson(request, env, { ok: true, id, name: body.name.trim(), email: body.email.toLowerCase() }, 201);
}

async function handleForgotPassword(request: Request, env: Env): Promise<Response> {
  const ip = extractClientIp(request);
  const ipLimit = await enforceOtpIpRateLimit(env.OTP_STORE, ip);
  if (!ipLimit.ok) {
    return apiJson(request, env, { error: ipLimit.message }, 429, {
      "Retry-After": String(ipLimit.retryAfter),
    });
  }

  const body = await readJsonBody<{ email: string }>(request);
  const email = normalizeEmail(body?.email ?? "");

  if (!email || !isValidEmail(email)) {
    return apiJson(request, env, { error: "Please provide a valid email address." }, 400);
  }

  if (await isResetEmailLocked(env.OTP_STORE, email)) {
    return apiJson(request, env, { error: "Too many attempts. Please wait before trying again." }, 429);
  }

  if (await isResetResendCoolingDown(env.OTP_STORE, email)) {
    return apiJson(request, env, { error: "Please wait before requesting another code." }, 429);
  }

  await ensureAuthUsersTable(env.HRMS);
  const authUser = await env.HRMS
    .prepare(`SELECT name FROM auth_users WHERE lower(email) = lower(?) AND is_verified = 1 LIMIT 1`)
    .bind(email)
    .first<{ name: string }>();

  // Always return success to avoid email enumeration
  if (!authUser) {
    return apiJson(request, env, { success: true });
  }

  const otp = generateOtpCode();
  await saveResetOtp(env.OTP_STORE, email, otp);
  await startResetResendCooldown(env.OTP_STORE, email);

  try {
    await sendResetPasswordEmail(env, authUser.name, email, otp);
  } catch {
    await deleteResetOtp(env.OTP_STORE, email);
    return apiJson(request, env, { error: "Failed to send reset code. Please try again." }, 502);
  }

  return apiJson(request, env, { success: true });
}

async function handleResetPassword(request: Request, env: Env): Promise<Response> {
  const ip = extractClientIp(request);
  const ipLimit = await enforceOtpIpRateLimit(env.OTP_STORE, ip);
  if (!ipLimit.ok) {
    return apiJson(request, env, { error: ipLimit.message }, 429, {
      "Retry-After": String(ipLimit.retryAfter),
    });
  }

  const body = await readJsonBody<{ email: string; otp: string; password: string }>(request);
  const email = normalizeEmail(body?.email ?? "");
  const otp = (body?.otp ?? "").trim();
  const password = (body?.password ?? "").trim();

  if (!email || !otp || !password) {
    return apiJson(request, env, { error: "Email, OTP, and new password are required." }, 400);
  }

  if (password.length < 8) {
    return apiJson(request, env, { error: "Password must be at least 8 characters." }, 400);
  }

  if (await isResetEmailLocked(env.OTP_STORE, email)) {
    return apiJson(request, env, { error: "Too many invalid attempts. Please request a new code." }, 429);
  }

  const stored = await readResetOtp(env.OTP_STORE, email);
  if (!stored) {
    return apiJson(request, env, { error: "Reset code expired or not found. Please request a new one." }, 400);
  }

  if (stored !== otp) {
    const attempts = await recordResetOtpFailure(env.OTP_STORE, email);
    const remaining = Math.max(getOtpAttemptBudget() - attempts, 0);

    if (remaining === 0) {
      await deleteResetOtp(env.OTP_STORE, email);
      return apiJson(request, env, { error: "Too many invalid attempts. Please request a new reset code." }, 429);
    }

    return apiJson(request, env, { error: `Invalid code. ${remaining} attempts remaining.` }, 400);
  }

  const newHash = await hashPassword(password);
  await env.HRMS
    .prepare(`UPDATE auth_users SET password = ? WHERE lower(email) = lower(?)`)
    .bind(newHash, email)
    .run();

  await deleteResetOtp(env.OTP_STORE, email);
  await clearResetOtpState(env.OTP_STORE, email);

  return apiJson(request, env, { success: true });
}

async function handleApiDeleteEmployee(employeeId: string, request: Request, env: Env): Promise<Response> {
  const auth = await requireApiAuth(request, env);
  if (!auth) {
    return apiJson(request, env, { error: "Unauthorized." }, 401);
  }

  const company = await env.HRMS
    .prepare(`SELECT id FROM companies WHERE owner_id = ? LIMIT 1`)
    .bind(auth.email)
    .first<{ id: string }>();

  if (!company) {
    return apiJson(request, env, { error: "Company not found." }, 404);
  }

  const result = await env.HRMS
    .prepare(`DELETE FROM saas_employees WHERE id = ? AND company_id = ?`)
    .bind(employeeId, company.id)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    return apiJson(request, env, { error: "Employee not found." }, 404);
  }

  return apiJson(request, env, { ok: true });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const preflight = handleCorsPreflight(request, env);
    if (preflight) {
      return preflight;
    }

    const url = new URL(request.url);
    const { method, pathname } = { method: request.method, pathname: url.pathname };

    if (method === "POST" && pathname === "/api/send-signup-otp") {
      return handleSendSignupOtp(request, env);
    }

    if (method === "POST" && pathname === "/api/verify-signup-otp") {
      return handleVerifySignupOtp(request, env);
    }

    if (method === "POST" && pathname === "/api/auth/login") {
      return handleApiLogin(request, env);
    }

    if (method === "POST" && pathname === "/api/auth/forgot-password") {
      return handleForgotPassword(request, env);
    }

    if (method === "POST" && pathname === "/api/auth/reset-password") {
      return handleResetPassword(request, env);
    }

    if (method === "POST" && pathname === "/api/auth/refresh") {
      return handleApiRefresh(request, env);
    }

    if (method === "POST" && pathname === "/api/auth/logout") {
      return handleApiLogout(request, env);
    }

    if (method === "GET" && pathname === "/api/company") {
      return handleApiGetCompany(request, env);
    }

    if (method === "GET" && pathname === "/api/company/usage") {
      return handleApiCompanyUsage(request, env);
    }

    if (method === "GET" && pathname === "/api/employees") {
      return handleApiGetEmployees(request, env);
    }

    if (method === "POST" && pathname === "/api/employees") {
      return handleApiAddEmployee(request, env);
    }

    const employeeDeleteMatch = pathname.match(/^\/api\/employees\/([^/]+)$/);
    if (method === "DELETE" && employeeDeleteMatch) {
      return handleApiDeleteEmployee(employeeDeleteMatch[1], request, env);
    }

    const coreHrmsResponse = await handleCoreHrmsApi(request, env);
    if (coreHrmsResponse) {
      return coreHrmsResponse;
    }

    const schemaCoreResponse = await handleSchemaCoreApi(request, env);
    if (schemaCoreResponse) {
      return schemaCoreResponse;
    }

    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<Env>;
