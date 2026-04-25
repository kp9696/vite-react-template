/**
 * Resource route: GET /api/payroll/run-status?monthKey=YYYY-MM
 *
 * Returns the payroll run lifecycle state for a given month.
 * Used by the payroll page via useFetcher to show lock / finalize / disburse
 * status without a full page reload.
 */
import type { Route } from "./+types/api.payroll.run-status";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { isAdminRole } from "../lib/hrms.shared";

interface PayrollRunRow {
  id: string;
  month_key: string;
  status: string;
  processed_count: number;
  total_count: number;
  locked: number;
  locked_by: string | null;
  locked_at: string | null;
  finalized: number;
  finalized_by: string | null;
  finalized_at: string | null;
  disbursed: number;
  disbursed_by: string | null;
  disbursed_at: string | null;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  // Use try/catch so that an unauthenticated request returns { run: null }
  // instead of throwing a redirect — fetcher redirects cause React Router
  // to bubble a 401 to the error boundary, crashing the whole page.
  let currentUser: Awaited<ReturnType<typeof requireSignedInUser>>;
  try {
    currentUser = await requireSignedInUser(request, context.cloudflare.env);
  } catch {
    return { run: null };
  }

  if (!isAdminRole(currentUser.role)) {
    return { run: null };
  }

  const url = new URL(request.url);
  const monthKey = url.searchParams.get("monthKey");
  if (!monthKey) return { run: null };

  const tenantId = currentUser.companyId ?? currentUser.id;

  const row = await context.cloudflare.env.HRMS
    .prepare(
      `SELECT id, month_key, status, processed_count, total_count,
              locked, locked_by, locked_at,
              finalized, finalized_by, finalized_at,
              disbursed, disbursed_by, disbursed_at
       FROM payroll_runs
       WHERE company_id = ? AND month_key = ?
       LIMIT 1`,
    )
    .bind(tenantId, monthKey)
    .first<PayrollRunRow>();

  if (!row) return { run: null };

  return {
    run: {
      monthKey: row.month_key,
      status: row.status,
      locked: Boolean(row.locked),
      locked_by: row.locked_by,
      locked_at: row.locked_at,
      finalized: Boolean(row.finalized),
      finalized_by: row.finalized_by,
      finalized_at: row.finalized_at,
      disbursed: Boolean(row.disbursed),
      disbursed_by: row.disbursed_by,
      disbursed_at: row.disbursed_at,
    },
  };
}
