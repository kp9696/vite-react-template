interface MarkFilingInput {
  companyId: string;
  filingType: string;
  period: string;
  filePath?: string | null;
  filedBy: string;
  errorMessage?: string | null;
}

interface PendingFilingInput {
  companyId: string;
  filingType: string;
  period: string;
}

export async function listStatutoryFilings(db: D1Database, companyId: string) {
  return db
    .prepare(`SELECT * FROM statutory_filings WHERE company_id = ? ORDER BY period DESC, filing_type`)
    .bind(companyId)
    .all();
}

export async function markFilingAsFiled(db: D1Database, input: MarkFilingInput) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO statutory_filings (id, company_id, filing_type, period, status, file_path, filed_by, filed_at, error_message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(company_id, filing_type, period)
       DO UPDATE SET
         status = excluded.status,
         file_path = excluded.file_path,
         filed_by = excluded.filed_by,
         filed_at = excluded.filed_at,
         error_message = excluded.error_message,
         updated_at = excluded.updated_at`,
    )
    .bind(
      crypto.randomUUID(),
      input.companyId,
      input.filingType,
      input.period,
      input.errorMessage ? "failed" : "filed",
      input.filePath ?? null,
      input.filedBy,
      now,
      input.errorMessage ?? null,
      now,
      now,
    )
    .run();
}

export async function upsertPendingFiling(db: D1Database, input: PendingFilingInput) {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO statutory_filings (id, company_id, filing_type, period, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)
       ON CONFLICT(company_id, filing_type, period) DO NOTHING`,
    )
    .bind(crypto.randomUUID(), input.companyId, input.filingType, input.period, now, now)
    .run();
}
