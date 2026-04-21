export async function createNotification(
  db: D1Database,
  opts: {
    companyId: string;
    userId: string;
    type: string;
    title: string;
    body?: string;
    link?: string;
  },
): Promise<void> {
  const id = `NOTIF${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO notifications (id, company_id, org_id, user_id, type, title, body, link, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, opts.companyId, opts.companyId, opts.userId, opts.type, opts.title, opts.body ?? null, opts.link ?? null, now)
    .run();
}
