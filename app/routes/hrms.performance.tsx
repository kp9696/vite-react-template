import { useEffect, useRef, useState } from "react";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import type { Route } from "./+types/hrms.performance";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import { avatarColor, getInitials, isAdminRole } from "../lib/hrms.shared";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReviewCycle {
  id: string;
  name: string;
  review_type: string;
  start_date: string | null;
  end_date: string | null;
  status: string;
  created_by: string;
  created_at: string;
}

interface PerformanceReview {
  id: string;
  cycle_id: string;
  reviewee_id: string;
  reviewee_name: string;
  reviewer_id: string;
  reviewer_name: string;
  reviewer_type: string;
  rating: number | null;
  comments: string | null;
  status: string;
  submitted_at: string | null;
}

interface OKR {
  id: string;
  user_id: string;
  cycle_id: string | null;
  objective: string;
  key_results: string; // JSON string
  progress: number;
  status: string;
  due_date: string | null;
  created_at: string;
}

interface KeyResult {
  title: string;
  target: number;
  current: number;
  unit: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const REVIEW_TYPE_LABELS: Record<string, string> = {
  "360": "360° (Self + Manager + Peer)",
  manager: "Manager Review",
  self: "Self Assessment",
};

const RATING_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "Poor",        color: "#ef4444" },
  2: { label: "Below Avg",   color: "#f97316" },
  3: { label: "Average",     color: "#eab308" },
  4: { label: "Good",        color: "#22c55e" },
  5: { label: "Exceptional", color: "#6366f1" },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active:    { bg: "#dcfce7", text: "#16a34a" },
  draft:     { bg: "#f1f5f9", text: "#64748b" },
  completed: { bg: "#ede9fe", text: "#7c3aed" },
};

// ── Meta + Loader ─────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "JWithKP HRMS - Performance" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const currentUser = await requireSignedInUser(request, env);

  const [cyclesRes, okrsRes] = await Promise.all([
    callCoreHrmsApi<{ cycles?: ReviewCycle[] }>({
      request, env, currentUser,
      path: "/api/performance/cycles",
    }),
    callCoreHrmsApi<{ okrs?: OKR[] }>({
      request, env, currentUser,
      path: "/api/performance/okrs",
    }),
  ]);

  return {
    currentUser,
    isAdmin: isAdminRole(currentUser.role),
    cycles: cyclesRes?.cycles ?? [],
    okrs: okrsRes?.okrs ?? [],
  };
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const currentUser = await requireSignedInUser(request, env);
  const fd = await request.formData();
  const intent = fd.get("intent") as string;

  if (intent === "create-cycle") {
    const name       = (fd.get("name") as string)?.trim();
    const reviewType = (fd.get("reviewType") as string) || "360";
    const startDate  = (fd.get("startDate") as string) || undefined;
    const endDate    = (fd.get("endDate") as string) || undefined;

    if (!name) return { error: "Cycle name is required." };

    const res = await callCoreHrmsApi<{ ok?: boolean; id?: string; error?: string }>({
      request, env, currentUser,
      path: "/api/performance/cycles",
      method: "POST",
      body: { name, reviewType, startDate, endDate },
    });

    if (res?.error) return { error: res.error };
    return { ok: true, intent, cycleId: res?.id };
  }

  if (intent === "get-reviews") {
    const cycleId = fd.get("cycleId") as string;
    if (!cycleId) return { reviews: [], intent };
    const res = await callCoreHrmsApi<{ reviews?: PerformanceReview[] }>({
      request, env, currentUser,
      path: `/api/performance/cycles/${cycleId}/reviews`,
    });
    return { reviews: res?.reviews ?? [], intent };
  }

  if (intent === "submit-review") {
    const reviewId = fd.get("reviewId") as string;
    const rating   = Number(fd.get("rating"));
    const comments = (fd.get("comments") as string) || "";

    if (!reviewId || !rating) return { error: "Review ID and rating are required." };

    const res = await callCoreHrmsApi<{ ok?: boolean; error?: string }>({
      request, env, currentUser,
      path: "/api/performance/reviews/submit",
      method: "POST",
      body: { reviewId, rating, comments },
    });

    if (res?.error) return { error: res.error };
    return { ok: true, intent };
  }

  if (intent === "create-okr") {
    const objective  = (fd.get("objective") as string)?.trim();
    const cycleId    = (fd.get("cycleId") as string) || undefined;
    const dueDate    = (fd.get("dueDate") as string) || undefined;
    const krRaw      = fd.get("keyResults") as string;

    if (!objective) return { error: "Objective is required." };

    let keyResults: KeyResult[] = [];
    try { keyResults = JSON.parse(krRaw || "[]"); } catch { /* ignore */ }

    const res = await callCoreHrmsApi<{ ok?: boolean; id?: string; error?: string }>({
      request, env, currentUser,
      path: "/api/performance/okrs",
      method: "POST",
      body: { objective, keyResults, cycleId, dueDate },
    });

    if (res?.error) return { error: res.error };
    return { ok: true, intent, okrId: res?.id };
  }

  if (intent === "update-okr-progress") {
    const okrId    = fd.get("okrId") as string;
    const progress = Number(fd.get("progress"));

    const res = await callCoreHrmsApi<{ ok?: boolean; error?: string }>({
      request, env, currentUser,
      path: `/api/performance/okrs/${okrId}/progress`,
      method: "PATCH",
      body: { progress },
    });

    if (res?.error) return { error: res.error };
    return { ok: true, intent };
  }

  return { error: "Unknown intent." };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Performance() {
  const { currentUser, isAdmin, cycles: initialCycles, okrs: initialOkrs } = useLoaderData<typeof loader>();

  const [cycles, setCycles]       = useState<ReviewCycle[]>(initialCycles);
  const [okrs, setOkrs]           = useState<OKR[]>(initialOkrs);

  // Sync state when loader revalidates
  useEffect(() => { setCycles(initialCycles); }, [initialCycles]);
  useEffect(() => { setOkrs(initialOkrs); }, [initialOkrs]);
  const [toast, setToast]         = useState<string | null>(null);
  const [toastErr, setToastErr]   = useState<string | null>(null);

  // Cycle form
  const [showCycleForm, setShowCycleForm]   = useState(false);
  const [cycleName, setCycleName]           = useState("");
  const [reviewType, setReviewType]         = useState("360");
  const [cycleStart, setCycleStart]         = useState("");
  const [cycleEnd, setCycleEnd]             = useState("");

  // Reviews panel
  const [selectedCycle, setSelectedCycle]   = useState<ReviewCycle | null>(null);
  const [reviews, setReviews]               = useState<PerformanceReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // Submit review modal
  const [reviewModal, setReviewModal]       = useState<PerformanceReview | null>(null);
  const [reviewRating, setReviewRating]     = useState(0);
  const [reviewComment, setReviewComment]   = useState("");

  // OKR form
  const [showOkrForm, setShowOkrForm]       = useState(false);
  const [okrObjective, setOkrObjective]     = useState("");
  const [okrDue, setOkrDue]                 = useState("");
  const [okrCycle, setOkrCycle]             = useState("");
  const [krList, setKrList]                 = useState<KeyResult[]>([
    { title: "", target: 100, current: 0, unit: "%" },
  ]);

  // OKR progress edit
  const [progressOkrId, setProgressOkrId]   = useState<string | null>(null);
  const [progressVal, setProgressVal]       = useState(0);

  const revalidator    = useRevalidator();
  const cycleFetcher   = useFetcher<typeof action>();
  const reviewFetcher  = useFetcher<typeof action>();
  const reviewsFetcher  = useFetcher<typeof action>();
  const okrFetcher     = useFetcher<typeof action>();
  const progressFetcher = useFetcher<typeof action>();

  // ── Toast timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!toastErr) return;
    const t = setTimeout(() => setToastErr(null), 5000);
    return () => clearTimeout(t);
  }, [toastErr]);

  // ── Cycle fetcher result ───────────────────────────────────────────────────
  useEffect(() => {
    if (!cycleFetcher.data) return;
    if ("error" in cycleFetcher.data) {
      setToastErr(cycleFetcher.data.error as string);
      return;
    }
    if ("ok" in cycleFetcher.data) {
      setShowCycleForm(false);
      setCycleName(""); setReviewType("360"); setCycleStart(""); setCycleEnd("");
      setToast(`Review cycle "${cycleName}" launched! Reviews created for all employees.`);
      revalidator.revalidate();
    }
  }, [cycleFetcher.data]);

  // ── Review submit result ───────────────────────────────────────────────────
  useEffect(() => {
    if (!reviewFetcher.data) return;
    if ("error" in reviewFetcher.data) {
      setToastErr(reviewFetcher.data.error as string);
      return;
    }
    if ("ok" in reviewFetcher.data) {
      setReviewModal(null);
      setReviewRating(0); setReviewComment("");
      setToast("Review submitted successfully!");
      if (selectedCycle) loadReviews(selectedCycle.id);
    }
  }, [reviewFetcher.data]);

  // ── OKR create result ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!okrFetcher.data) return;
    if ("error" in okrFetcher.data) {
      setToastErr(okrFetcher.data.error as string);
      return;
    }
    if ("ok" in okrFetcher.data) {
      setShowOkrForm(false);
      setOkrObjective(""); setOkrDue(""); setOkrCycle("");
      setKrList([{ title: "", target: 100, current: 0, unit: "%" }]);
      setToast("OKR created!");
      revalidator.revalidate();
    }
  }, [okrFetcher.data]);

  // ── Progress update result ─────────────────────────────────────────────────
  useEffect(() => {
    if (!progressFetcher.data) return;
    if ("error" in progressFetcher.data) {
      setToastErr(progressFetcher.data.error as string);
      return;
    }
    if ("ok" in progressFetcher.data) {
      setProgressOkrId(null);
      setToast("OKR progress updated!");
      setOkrs(prev => prev.map(o => o.id === progressOkrId ? { ...o, progress: progressVal } : o));
    }
  }, [progressFetcher.data]);

  // ── Reviews fetcher result ─────────────────────────────────────────────────
  useEffect(() => {
    if (!reviewsFetcher.data) return;
    if ("reviews" in reviewsFetcher.data) {
      setReviews((reviewsFetcher.data as { reviews: PerformanceReview[] }).reviews);
      setReviewsLoading(false);
    }
  }, [reviewsFetcher.data]);

  // ── Load reviews for a cycle (via server action) ───────────────────────────
  function loadReviews(cycleId: string) {
    setReviewsLoading(true);
    reviewsFetcher.submit({ intent: "get-reviews", cycleId }, { method: "post" });
  }

  function openCyclePanel(cycle: ReviewCycle) {
    setSelectedCycle(cycle);
    loadReviews(cycle.id);
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const activeCycle    = cycles.find(c => c.status === "active");
  const completedCount = reviews.filter(r => r.status === "submitted").length;
  const totalCount     = reviews.length;
  const submittedWithRating = reviews.filter(r => r.rating !== null);
  const avgScore = submittedWithRating.length
    ? (submittedWithRating.reduce((s, r) => s + (r.rating ?? 0), 0) / submittedWithRating.length).toFixed(1)
    : "—";
  const topPerformers = submittedWithRating.filter(r => (r.rating ?? 0) >= 4).length;

  // ── KR helpers ────────────────────────────────────────────────────────────
  const addKR = () => setKrList(prev => [...prev, { title: "", target: 100, current: 0, unit: "%" }]);
  const removeKR = (i: number) => setKrList(prev => prev.filter((_, idx) => idx !== i));
  const updateKR = (i: number, field: keyof KeyResult, val: string | number) =>
    setKrList(prev => prev.map((kr, idx) => idx === i ? { ...kr, [field]: val } : kr));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <HRMSLayout currentUser={currentUser}>

      {/* Toast Success */}
      {toast && (
        <div style={toastStyle("#0f172a")}>
          <span style={{ fontSize: 16 }}>✓</span> {toast}
        </div>
      )}
      {/* Toast Error */}
      {toastErr && (
        <div style={toastStyle("#dc2626")}>
          <span style={{ fontSize: 16 }}>✕</span> {toastErr}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <div className="page-title">Performance</div>
          <div className="page-sub">360° reviews, OKRs, and growth insights.</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowCycleForm(true)}>
            + Start Review Cycle
          </button>
        )}
      </div>

      {/* Create Cycle Form */}
      {showCycleForm && (
        <div className="card" style={{ marginBottom: 24, borderTop: "3px solid var(--accent)" }}>
          <div className="card-title">Configure Review Cycle</div>
          <cycleFetcher.Form method="post">
            <input type="hidden" name="intent" value="create-cycle" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelSt}>Cycle Name *</label>
                <input name="name" value={cycleName} onChange={e => setCycleName(e.target.value)}
                  placeholder="e.g. Q2 2026 Review" style={fieldSt} required />
              </div>
              <div>
                <label style={labelSt}>Review Type</label>
                <select name="reviewType" value={reviewType} onChange={e => setReviewType(e.target.value)} style={fieldSt}>
                  <option value="360">360° (Self + Manager + Peer)</option>
                  <option value="manager">Manager Review Only</option>
                  <option value="self">Self Assessment Only</option>
                </select>
              </div>
              <div></div>
              <div>
                <label style={labelSt}>Start Date</label>
                <input type="date" name="startDate" value={cycleStart} onChange={e => setCycleStart(e.target.value)} style={fieldSt} />
              </div>
              <div>
                <label style={labelSt}>End Date</label>
                <input type="date" name="endDate" value={cycleEnd} onChange={e => setCycleEnd(e.target.value)} style={fieldSt} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" type="submit" disabled={!cycleName.trim() || cycleFetcher.state !== "idle"}>
                {cycleFetcher.state !== "idle" ? "Launching…" : "🚀 Launch Cycle"}
              </button>
              <button className="btn btn-outline" type="button" onClick={() => setShowCycleForm(false)}>Cancel</button>
            </div>
          </cycleFetcher.Form>
        </div>
      )}

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        {[
          { label: "Active Cycle",   value: activeCycle?.name ?? "—",   sub: activeCycle ? "In progress" : "No active cycle" },
          { label: "Reviews Done",   value: totalCount ? `${completedCount}/${totalCount}` : "—", sub: selectedCycle ? selectedCycle.name : "Select a cycle" },
          { label: "Avg Score",      value: avgScore,                    sub: avgScore === "—" ? "No scores yet" : "out of 5" },
          { label: "Top Performers", value: topPerformers,               sub: "Rating 4+ in selected cycle" },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ fontSize: 22 }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="two-col">

        {/* ── Left: Cycles + Reviews ─────────────────────────────────────── */}
        <div className="card" style={{ flex: "1 1 55%" }}>
          <div className="card-title">Review Cycles</div>

          {cycles.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>No review cycles yet</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 20 }}>
                {isAdmin ? "Start your first review cycle to kick off 360° reviews." : "No cycles have been started yet."}
              </div>
              {isAdmin && (
                <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setShowCycleForm(true)}>
                  + Start Review Cycle
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {cycles.map(cycle => {
                const sc = STATUS_COLORS[cycle.status] || STATUS_COLORS.draft;
                const isSelected = selectedCycle?.id === cycle.id;
                return (
                  <div
                    key={cycle.id}
                    onClick={() => openCyclePanel(cycle)}
                    style={{
                      padding: "14px 16px",
                      borderRadius: 10,
                      border: `1.5px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                      background: isSelected ? "var(--accent-light, #f0f4ff)" : "var(--surface)",
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      transition: "border-color 0.15s",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{cycle.name}</div>
                      <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>
                        {REVIEW_TYPE_LABELS[cycle.review_type] || cycle.review_type}
                        {cycle.start_date && ` · ${cycle.start_date}`}
                        {cycle.end_date   && ` – ${cycle.end_date}`}
                      </div>
                    </div>
                    <span style={{
                      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                      background: sc.bg, color: sc.text, textTransform: "capitalize",
                    }}>
                      {cycle.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Reviews for selected cycle */}
          {selectedCycle && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: "var(--ink)" }}>
                Reviews — {selectedCycle.name}
                {reviewsLoading && <span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: 8 }}>Loading…</span>}
              </div>

              {!reviewsLoading && reviews.length === 0 && (
                <div style={{ fontSize: 13, color: "var(--ink-3)", textAlign: "center", padding: "20px 0" }}>
                  No reviews found for this cycle.
                </div>
              )}

              {reviews.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "var(--surface)", borderBottom: "1.5px solid var(--border)" }}>
                        {["Employee", "Reviewer", "Type", "Rating", "Status", ""].map(h => (
                          <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "var(--ink-3)", fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reviews.map(rv => {
                        const ri = rv.rating ? RATING_LABELS[rv.rating] : null;
                        const canSubmit = rv.status === "pending" && rv.reviewer_id === currentUser.id;
                        return (
                          <tr key={rv.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={tdSt}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 28, height: 28, borderRadius: "50%", background: avatarColor(rv.reviewee_name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "white", flexShrink: 0 }}>
                                  {getInitials(rv.reviewee_name)}
                                </div>
                                <span style={{ fontWeight: 600 }}>{rv.reviewee_name || rv.reviewee_id}</span>
                              </div>
                            </td>
                            <td style={tdSt}>{rv.reviewer_name || rv.reviewer_id}</td>
                            <td style={tdSt}>
                              <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "#f1f5f9", color: "#475569", textTransform: "capitalize" }}>
                                {rv.reviewer_type}
                              </span>
                            </td>
                            <td style={tdSt}>
                              {ri ? (
                                <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${ri.color}18`, color: ri.color }}>
                                  {rv.rating}/5 · {ri.label}
                                </span>
                              ) : <span style={{ color: "var(--ink-3)" }}>—</span>}
                            </td>
                            <td style={tdSt}>
                              <span style={{
                                padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                                background: rv.status === "submitted" ? "#dcfce7" : "#fef9c3",
                                color: rv.status === "submitted" ? "#16a34a" : "#854d0e",
                                textTransform: "capitalize",
                              }}>
                                {rv.status}
                              </span>
                            </td>
                            <td style={tdSt}>
                              {canSubmit && (
                                <button
                                  className="btn btn-outline"
                                  style={{ fontSize: 11, padding: "4px 10px" }}
                                  onClick={() => { setReviewModal(rv); setReviewRating(0); setReviewComment(""); }}
                                >
                                  Submit
                                </button>
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
          )}
        </div>

        {/* ── Right: OKRs ───────────────────────────────────────────────── */}
        <div className="card" style={{ flex: "1 1 42%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="card-title" style={{ margin: 0 }}>OKRs</div>
            <button className="btn btn-outline" style={{ fontSize: 12, padding: "5px 12px" }} onClick={() => setShowOkrForm(true)}>
              + Add OKR
            </button>
          </div>

          {/* OKR create form */}
          {showOkrForm && (
            <okrFetcher.Form method="post" style={{ background: "var(--surface)", borderRadius: 10, padding: 16, marginBottom: 16, border: "1.5px solid var(--border)" }}>
              <input type="hidden" name="intent" value="create-okr" />
              <input type="hidden" name="keyResults" value={JSON.stringify(krList)} />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <label style={labelSt}>Objective *</label>
                  <input name="objective" value={okrObjective} onChange={e => setOkrObjective(e.target.value)}
                    placeholder="e.g. Scale engineering team to 50 people" style={fieldSt} required />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={labelSt}>Link to Cycle</label>
                    <select name="cycleId" value={okrCycle} onChange={e => setOkrCycle(e.target.value)} style={fieldSt}>
                      <option value="">None</option>
                      {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelSt}>Due Date</label>
                    <input type="date" name="dueDate" value={okrDue} onChange={e => setOkrDue(e.target.value)} style={fieldSt} />
                  </div>
                </div>

                {/* Key Results */}
                <div>
                  <label style={labelSt}>Key Results</label>
                  {krList.map((kr, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px 50px auto", gap: 6, marginBottom: 6, alignItems: "center" }}>
                      <input value={kr.title} onChange={e => updateKR(i, "title", e.target.value)}
                        placeholder="Key result title" style={{ ...fieldSt, fontSize: 12 }} />
                      <input type="number" value={kr.target} onChange={e => updateKR(i, "target", Number(e.target.value))}
                        placeholder="Target" style={{ ...fieldSt, fontSize: 12 }} />
                      <input type="number" value={kr.current} onChange={e => updateKR(i, "current", Number(e.target.value))}
                        placeholder="Current" style={{ ...fieldSt, fontSize: 12 }} />
                      <input value={kr.unit} onChange={e => updateKR(i, "unit", e.target.value)}
                        placeholder="Unit" style={{ ...fieldSt, fontSize: 12 }} />
                      {krList.length > 1 && (
                        <button type="button" onClick={() => removeKR(i)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16, padding: "0 4px" }}>×</button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={addKR} style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 2 }}>
                    + Add Key Result
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                <button className="btn btn-primary" style={{ fontSize: 12 }} type="submit"
                  disabled={!okrObjective.trim() || okrFetcher.state !== "idle"}>
                  {okrFetcher.state !== "idle" ? "Saving…" : "Add OKR"}
                </button>
                <button className="btn btn-outline" style={{ fontSize: 12 }} type="button" onClick={() => setShowOkrForm(false)}>Cancel</button>
              </div>
            </okrFetcher.Form>
          )}

          {/* OKR list */}
          {okrs.length === 0 && !showOkrForm && (
            <div style={{ textAlign: "center", padding: "30px 20px" }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🎯</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>No OKRs defined</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 16 }}>
                Set objectives and key results to align your team.
              </div>
              <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => setShowOkrForm(true)}>
                + Add First OKR
              </button>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {okrs.map(okr => {
              const krs: KeyResult[] = (() => { try { return JSON.parse(okr.key_results); } catch { return []; } })();
              const isEditing = progressOkrId === okr.id;
              const statusColor = okr.status === "completed" ? "#16a34a" : okr.status === "cancelled" ? "#dc2626" : "#6366f1";

              return (
                <div key={okr.id} style={{ padding: "14px 16px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--surface)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", flex: 1, paddingRight: 12 }}>{okr.objective}</div>
                    <span style={{ padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${statusColor}18`, color: statusColor, flexShrink: 0, textTransform: "capitalize" }}>
                      {okr.status}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-3)", marginBottom: 4 }}>
                      <span>Progress</span>
                      <span>{okr.progress}%</span>
                    </div>
                    <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${okr.progress}%`, background: "var(--accent)", borderRadius: 3, transition: "width 0.3s" }} />
                    </div>
                  </div>

                  {/* Key results */}
                  {krs.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      {krs.map((kr, i) => {
                        const pct = kr.target > 0 ? Math.min(100, Math.round((kr.current / kr.target) * 100)) : 0;
                        return (
                          <div key={i} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-3)", marginBottom: 2 }}>
                              <span>{kr.title || `KR ${i + 1}`}</span>
                              <span>{kr.current}/{kr.target} {kr.unit}</span>
                            </div>
                            <div style={{ height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: "#22c55e", borderRadius: 2 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {okr.due_date && (
                    <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 6 }}>Due: {okr.due_date}</div>
                  )}

                  {/* Progress update inline */}
                  {isEditing ? (
                    <progressFetcher.Form method="post" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                      <input type="hidden" name="intent" value="update-okr-progress" />
                      <input type="hidden" name="okrId" value={okr.id} />
                      <input type="range" name="progress" min={0} max={100} value={progressVal}
                        onChange={e => setProgressVal(Number(e.target.value))}
                        style={{ flex: 1 }} />
                      <span style={{ fontSize: 13, fontWeight: 700, width: 36 }}>{progressVal}%</span>
                      <button className="btn btn-primary" style={{ fontSize: 11, padding: "4px 10px" }} type="submit"
                        disabled={progressFetcher.state !== "idle"}>
                        Save
                      </button>
                      <button type="button" className="btn btn-outline" style={{ fontSize: 11, padding: "4px 10px" }} onClick={() => setProgressOkrId(null)}>
                        Cancel
                      </button>
                    </progressFetcher.Form>
                  ) : (
                    <button className="btn btn-outline" style={{ fontSize: 11, padding: "4px 10px", marginTop: 4 }}
                      onClick={() => { setProgressOkrId(okr.id); setProgressVal(okr.progress); }}>
                      Update Progress
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Submit Review Modal ─────────────────────────────────────────────── */}
      {reviewModal && (
        <div style={overlayStyle} onClick={() => setReviewModal(null)}>
          <div style={modalStyle} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 17 }}>Submit Review</div>
                <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>
                  {reviewModal.reviewer_type === "self" ? "Self assessment" : "Reviewing"}: <strong>{reviewModal.reviewee_name}</strong>
                </div>
              </div>
              <button onClick={() => setReviewModal(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--ink-3)", lineHeight: 1 }}>×</button>
            </div>

            <reviewFetcher.Form method="post">
              <input type="hidden" name="intent" value="submit-review" />
              <input type="hidden" name="reviewId" value={reviewModal.id} />

              {/* Star rating */}
              <div style={{ marginBottom: 20 }}>
                <label style={labelSt}>Rating *</label>
                <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                  {[1, 2, 3, 4, 5].map(n => {
                    const ri = RATING_LABELS[n];
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setReviewRating(n)}
                        style={{
                          flex: 1, padding: "10px 4px", borderRadius: 10, border: `2px solid ${reviewRating === n ? ri.color : "var(--border)"}`,
                          background: reviewRating === n ? `${ri.color}18` : "white",
                          cursor: "pointer", textAlign: "center", transition: "all 0.15s",
                        }}
                      >
                        <div style={{ fontSize: 18 }}>{"★".repeat(n)}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: reviewRating === n ? ri.color : "var(--ink-3)", marginTop: 4 }}>{ri.label}</div>
                      </button>
                    );
                  })}
                </div>
                <input type="hidden" name="rating" value={reviewRating} />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelSt}>Comments</label>
                <textarea
                  name="comments"
                  value={reviewComment}
                  onChange={e => setReviewComment(e.target.value)}
                  placeholder="Provide constructive feedback…"
                  style={{ ...fieldSt, height: 100, resize: "vertical" as const }}
                />
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-primary" type="submit" disabled={!reviewRating || reviewFetcher.state !== "idle"}>
                  {reviewFetcher.state !== "idle" ? "Submitting…" : "Submit Review"}
                </button>
                <button className="btn btn-outline" type="button" onClick={() => setReviewModal(null)}>Cancel</button>
              </div>
            </reviewFetcher.Form>
          </div>
        </div>
      )}

    </HRMSLayout>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const labelSt: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 6,
};
const fieldSt: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1.5px solid var(--border)", borderRadius: 8,
  fontSize: 13, background: "white", fontFamily: "inherit", color: "var(--ink)",
  outline: "none", boxSizing: "border-box" as const,
};
const tdSt: React.CSSProperties = {
  padding: "10px 12px", verticalAlign: "middle",
};
const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9000,
  display: "flex", alignItems: "center", justifyContent: "center",
};
const modalStyle: React.CSSProperties = {
  background: "white", borderRadius: 16, padding: "28px 28px 24px",
  width: "min(600px, 96vw)", maxHeight: "90vh", overflowY: "auto",
  boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
};
function toastStyle(bg: string): React.CSSProperties {
  return {
    position: "fixed", top: 20, right: 20, zIndex: 9999,
    background: bg, color: "white", padding: "12px 20px", borderRadius: 12,
    fontSize: 13, fontWeight: 600, boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
    maxWidth: 380, display: "flex", alignItems: "center", gap: 10,
  };
}
