interface Env {
  // ── Cloudflare bindings ──────────────────────────────────────────────────
  HRMS: D1Database;
  OTP_STORE: KVNamespace;

  // ── Microsoft 365 / Graph API (primary email provider) ──────────────────
  // Azure app registration with Mail.Send permission (application, not delegated).
  // Set these three secrets in: wrangler secret put MS_TENANT_ID  (etc.)
  MS_TENANT_ID?: string;
  MS_CLIENT_ID?: string;
  MS_CLIENT_SECRET?: string;
  MS_FROM_EMAIL?: string; // defaults to "info@jwithkp.com"

  // ── Legacy SMTP bridge (fallback when MS_ secrets are absent) ───────────
  EMAIL_API_URL?: string;
  API_KEY?: string;

  // ── Gmail OAuth (used by registration-otp flow in app/lib) ──────────────
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  GMAIL_FROM_EMAIL?: string;

  // ── Resend (transactional email — primary OTP sender) ────────────────────
  RESEND_API_KEY?: string;

  // ── JWT (HS256 — used for REST API auth) ────────────────────────────────
  JWT_SECRET?: string;
  JWT_ACCESS_SECRET?: string;
  JWT_REFRESH_SECRET?: string;

  // ── CORS ────────────────────────────────────────────────────────────────
  CORS_ALLOWED_ORIGIN?: string;

  // ── Misc ─────────────────────────────────────────────────────────────────
  HRMS_BASE_URL?: string;
}
