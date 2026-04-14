interface Env {
  HRMS: D1Database;
  OTP_STORE: KVNamespace;
  EMAIL_API_URL?: string;
  API_KEY?: string;
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  GMAIL_FROM_EMAIL?: string;
  HRMS_BASE_URL?: string;
}
