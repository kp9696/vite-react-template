import { useEffect, useState, useCallback } from "react";

interface StatutoryFiling {
  id: string;
  filing_type: string;
  period: string;
  status: "pending" | "filed" | "failed";
  file_path: string | null;
  filed_by: string | null;
  filed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Compute the government filing due date from the filing type and period.
 * ECR (PF): 15th of the following month
 * TDS:       7th of the following month
 * PT:        15th of the following month
 */
function computeDueDate(filingType: string, period: string): Date | null {
  const match = period.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const nextMonth = new Date(Date.UTC(Number(match[1]), Number(match[2]), 1));
  const day = filingType.toUpperCase() === "TDS" ? 7 : 15;
  return new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), day));
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  filed:   { bg: "#d1fae5", color: "#065f46" },
  pending: { bg: "#fef3c7", color: "#92400e" },
  failed:  { bg: "#fee2e2", color: "#991b1b" },
};

export function StatutoryFilingsAdmin({ companyId }: { companyId: string }) {
  const [filings, setFilings] = useState<StatutoryFiling[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null); // filing id being updated
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const loadFilings = useCallback(() => {
    setLoading(true);
    fetch("/api/statutory-filings")
      .then(r => r.json() as Promise<{ filings: StatutoryFiling[] }>)
      .then(data => { setFilings(data.filings ?? []); setLoading(false); })
      .catch(e => { setError(String(e.message)); setLoading(false); });
  }, []);

  useEffect(() => { loadFilings(); }, [loadFilings]);

  async function markAsFiled(filing: StatutoryFiling) {
    setSubmitting(filing.id);
    try {
      const res = await fetch("/api/statutory-filings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filingType: filing.filing_type,
          period: filing.period,
          status: "filed",
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to mark as filed");
      setFilings(prev =>
        prev.map(f =>
          f.id === filing.id
            ? { ...f, status: "filed", filed_at: new Date().toISOString() }
            : f,
        ),
      );
      showToast(`${filing.filing_type} (${filing.period}) marked as filed.`, true);
    } catch (e) {
      showToast(String((e as Error).message), false);
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 24, zIndex: 9999,
          background: toast.ok ? "#10b981" : "#ef4444",
          color: "#fff", padding: "10px 20px", borderRadius: 8,
          fontWeight: 600, fontSize: 14, boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#111827" }}>Statutory Filings</h2>
        <button
          onClick={loadFilings}
          style={{ fontSize: 12, padding: "6px 14px", border: "1px solid #e5e7eb", borderRadius: 7, background: "white", cursor: "pointer", fontWeight: 600 }}
        >
          ↺ Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "#6b7280" }}>Loading filings…</div>
      ) : error ? (
        <div style={{ color: "#ef4444", padding: "12px 16px", background: "#fee2e2", borderRadius: 8 }}>Error: {error}</div>
      ) : filings.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "#6b7280", background: "#f9fafb", borderRadius: 10 }}>
          No statutory filings found. Run payroll to generate pending filings.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                {["Type", "Period", "Due Date", "Status", "Filed By", "Filed At", "Action"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filings.map(f => {
                const colors = STATUS_COLORS[f.status] ?? STATUS_COLORS.pending;
                const isBusy = submitting === f.id;
                const dueDate = computeDueDate(f.filing_type, f.period);
                const isOverdue = dueDate != null && f.status === "pending" && dueDate < new Date();
                const rowBg = isOverdue ? "#fff7ed" : undefined;
                return (
                  <tr key={f.id} style={{ borderBottom: "1px solid #f3f4f6", background: rowBg }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: "#111827" }}>{f.filing_type}</td>
                    <td style={{ padding: "10px 14px", color: "#374151" }}>{f.period}</td>
                    <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                      {dueDate ? (
                        <span style={{ color: isOverdue ? "#dc2626" : "#374151", fontWeight: isOverdue ? 700 : 400 }}>
                          {isOverdue && "⚠ "}{dueDate.toLocaleDateString("en-IN")}
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{
                        display: "inline-block", padding: "3px 10px", borderRadius: 20,
                        fontSize: 11, fontWeight: 700, textTransform: "capitalize",
                        background: colors.bg, color: colors.color,
                      }}>
                        {f.status}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", color: "#6b7280" }}>{f.filed_by ?? "—"}</td>
                    <td style={{ padding: "10px 14px", color: "#6b7280", whiteSpace: "nowrap" }}>
                      {f.filed_at ? new Date(f.filed_at).toLocaleString("en-IN") : "—"}
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {f.status !== "filed" ? (
                        <button
                          onClick={() => markAsFiled(f)}
                          disabled={isBusy}
                          style={{
                            padding: "5px 14px", borderRadius: 7, border: "none",
                            background: isBusy ? "#d1d5db" : "#4f46e5",
                            color: "white", fontSize: 12, fontWeight: 600,
                            cursor: isBusy ? "not-allowed" : "pointer",
                          }}
                        >
                          {isBusy ? "Saving…" : "Mark as Filed"}
                        </button>
                      ) : (
                        <span style={{ fontSize: 12, color: "#059669", fontWeight: 600 }}>✓ Filed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
