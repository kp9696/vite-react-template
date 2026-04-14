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

const OTP_TTL_SECONDS = 300;

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
}

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

async function sendSignupOtpEmail(env: Env, input: SendSignupOtpInput, otpCode: string): Promise<void> {
  if (!env.EMAIL_API_URL || !env.API_KEY) {
    throw new Error("Email bridge is not configured. Add EMAIL_API_URL and API_KEY as worker secrets.");
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
      subject: "Your signup verification code",
      text: `Hi ${input.name}, your OTP is ${otpCode}. It expires in 5 minutes.`,
      html: `<p>Hi ${input.name},</p><p>Your OTP is <strong>${otpCode}</strong>.</p><p>This code expires in 5 minutes.</p>`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send OTP email: ${await response.text()}`);
  }
}

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

  await ensureAuthUsersTable(env.HRMS);

  const existingUser = await env.HRMS
    .prepare(`SELECT id FROM auth_users WHERE lower(email) = lower(?) LIMIT 1`)
    .bind(email)
    .first<{ id: number }>();

  if (existingUser) {
    return jsonResponse({ error: "Email already registered" }, 409);
  }

  const otp = generateOtpCode();
  const pendingRecord: PendingSignupRecord = {
    otp,
    name,
    password: await hashPassword(password),
  };

  await env.OTP_STORE.put(email, JSON.stringify(pendingRecord), {
    expirationTtl: OTP_TTL_SECONDS,
  });

  try {
    await sendSignupOtpEmail(env, { name, email, password }, otp);
  } catch (error) {
    await env.OTP_STORE.delete(email);
    return jsonResponse({ error: error instanceof Error ? error.message : "Failed to send OTP." }, 502);
  }

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

  const pendingRaw = await env.OTP_STORE.get(email);
  if (!pendingRaw) {
    return jsonResponse({ error: "OTP expired or not found. Request a new OTP." }, 400);
  }

  let pendingData: PendingSignupRecord;
  try {
    pendingData = JSON.parse(pendingRaw) as PendingSignupRecord;
  } catch {
    await env.OTP_STORE.delete(email);
    return jsonResponse({ error: "OTP record is invalid. Request a new OTP." }, 400);
  }

  if (pendingData.otp !== otp) {
    return jsonResponse({ error: "Invalid OTP." }, 400);
  }

  await ensureAuthUsersTable(env.HRMS);

  const existingUser = await env.HRMS
    .prepare(`SELECT id FROM auth_users WHERE lower(email) = lower(?) LIMIT 1`)
    .bind(email)
    .first<{ id: number }>();

  if (existingUser) {
    await env.OTP_STORE.delete(email);
    return jsonResponse({ error: "Email already registered" }, 409);
  }

  await env.HRMS
    .prepare(`INSERT INTO auth_users (name, email, password, is_verified) VALUES (?, ?, ?, 1)`)
    .bind(pendingData.name, email, pendingData.password)
    .run();

  await env.OTP_STORE.delete(email);
  return jsonResponse({ success: true });
}

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
