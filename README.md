# JWithKP HRMS on Cloudflare Workers

React Router 7 + Cloudflare Workers app with D1, KV-backed OTP/rate-limits, and refresh-token-based auth sessions.

## Key modules

- Worker API and SSR entry: [workers/app.ts](workers/app.ts)
- Auth session helper for SSR routes: [app/lib/jwt-auth.server.ts](app/lib/jwt-auth.server.ts)
- Security helpers: [workers/security/auth.ts](workers/security/auth.ts), [workers/security/rateLimiter.ts](workers/security/rateLimiter.ts), [workers/security/otp.ts](workers/security/otp.ts)
- Auth schema migrations: [migrations/0007_auth_users.sql](migrations/0007_auth_users.sql), [migrations/0009_refresh_tokens.sql](migrations/0009_refresh_tokens.sql)

## Prerequisites

1. Install dependencies.

```bash
npm install
```

2. Confirm bindings in [wrangler.json](wrangler.json).

- D1 binding: `HRMS`
- KV binding: `OTP_STORE`

3. Apply D1 migrations.

```bash
npx wrangler d1 migrations apply HRMS
```

## Required secrets and vars

**Never put secrets in `wrangler.json` vars.** Use `wrangler secret put` for all sensitive values.

### Set secrets via CLI (required before deploy)

```bash
npx wrangler secret put JWT_ACCESS_SECRET
npx wrangler secret put JWT_SECRET
npx wrangler secret put OPENROUTER_API_KEY
```

Email provider (choose one path):

```bash
# Option A — Resend
npx wrangler secret put RESEND_API_KEY

# Option B — Microsoft Graph
npx wrangler secret put MS_TENANT_ID
npx wrangler secret put MS_CLIENT_ID
npx wrangler secret put MS_CLIENT_SECRET
npx wrangler secret put MS_FROM_EMAIL

# Option C — Fallback bridge
npx wrangler secret put EMAIL_API_URL
npx wrangler secret put API_KEY
```

Optional CORS:

```bash
npx wrangler secret put CORS_ALLOWED_ORIGIN
```

### Non-sensitive vars (safe in `wrangler.json`)

- `HRMS_BASE_URL` — public worker URL
- `LOGIN_DEBUG_ENABLED` — debug flag, set to `"false"` in production

## Local commands

```bash
npm run dev
npm run typecheck
npm run build
```

## Deploy

```bash
npm run deploy
```

## Smoke test checklist

1. Signup OTP send and verify on [app/routes/register.tsx](app/routes/register.tsx)
2. Email login on [app/routes/login.tsx](app/routes/login.tsx)
3. Refresh/logout API endpoints in [workers/app.ts](workers/app.ts)
4. Protected HRMS routes (for example [app/routes/hrms.tsx](app/routes/hrms.tsx))
