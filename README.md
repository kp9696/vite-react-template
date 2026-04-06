# JWithKP HRMS on Cloudflare Workers

This project is now set up as a React Router 7 app running on Cloudflare Workers with a D1-backed HRMS user module.

## What is wired up

- Cloudflare Worker entry in [workers/app.ts](/C:/Users/Admin/Documents/vite-react-template/workers/app.ts)
- D1 schema and seed migration in [migrations/0001_initial.sql](/C:/Users/Admin/Documents/vite-react-template/migrations/0001_initial.sql)
- Shared D1 helpers in [app/lib/hrms.server.ts](/C:/Users/Admin/Documents/vite-react-template/app/lib/hrms.server.ts)
- Invite mail helper in [app/lib/invite-email.server.ts](/C:/Users/Admin/Documents/vite-react-template/app/lib/invite-email.server.ts)
- Live D1 dashboard in [app/routes/hrms.tsx](/C:/Users/Admin/Documents/vite-react-template/app/routes/hrms.tsx)
- Live D1 user management in [app/routes/hrms.users.tsx](/C:/Users/Admin/Documents/vite-react-template/app/routes/hrms.users.tsx)

## Before deploy

1. Install dependencies:

```bash
npm install
```

2. Open [wrangler.json](/C:/Users/Admin/Documents/vite-react-template/wrangler.json) and replace:

- `PASTE_YOUR_D1_DATABASE_ID_HERE`

You can get that value from the Cloudflare dashboard or:

```bash
npx wrangler d1 list
```

3. Apply the D1 migration:

```bash
npx wrangler d1 migrations apply HRMS
```

4. Add these Worker variables in Cloudflare if you want invite emails to send:

- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `GMAIL_REFRESH_TOKEN`
- `GMAIL_FROM_EMAIL`
- `HRMS_BASE_URL`

Without Gmail variables, user records still save to D1 but invite delivery is skipped.

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

## Recommended Cloudflare flow

1. Bind the D1 database named `HRMS` to this Worker.
2. Apply the migration.
3. Deploy the Worker.
4. Verify `/hrms` and `/hrms/users` on your production URL.
