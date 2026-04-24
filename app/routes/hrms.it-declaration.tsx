import { useEffect, useState, useCallback } from "react";
import { useLoaderData, useFetcher } from "react-router";
import type { Route } from "./+types/hrms.it-declaration";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { isAdminRole } from "../lib/hrms.shared";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import { computeOldRegimeTDS, type ITDeclarationForPayroll } from "../lib/tax-calc";

export function meta() {
  return [{ title: "JWithKP HRMS - IT Declaration" }];
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ITDeclaration extends ITDeclarationForPayroll {
  id?: string;
  user_id?: string;
  user_name?: string;
  financial_year?: string;
  status?: "draft" | "submitted" | "approved";
  submitted_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
}

interface LoaderData {
  currentUser: { id: string; name: string; role: string; email: string; companyId?: string | null };
  isAdmin: boolean;
  declaration: ITDeclaration | null;
  allDeclarations: (ITDeclaration & { user_name: string })[];
  financialYear: string;
  annualCtc: number;
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs): Promise<LoaderData> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const isAdmin = isAdminRole(currentUser.role);

  const [declRes, salaryRes] = await Promise.all([
    callCoreHrmsApi<{ declaration?: ITDeclaration; declarations?: (ITDeclaration & { user_name: string })[]; financialYear: string }>({
      request, env: context.cloudflare.env, currentUser,
      path: "/api/it-declarations",
    }),
    isAdmin ? null : callCoreHrmsApi<{ configs?: Array<{ user_id: string; annual_ctc: number }> }>({
      request, env: context.cloudflare.env, currentUser,
      path: "/api/salary-configs",
    }),
  ]);

  const annualCtc = salaryRes?.configs?.find((c) => c.user_id === currentUser.id)?.annual_ctc ?? 0;

  return {
    currentUser,
    isAdmin,
    declaration: declRes?.declaration ?? null,
    allDeclarations: declRes?.declarations ?? [],
    financialYear: declRes?.financialYear ?? "",
    annualCtc,
  };
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "save" || intent === "submit") {
    const body: Record<string, unknown> = {
      financialYear: String(formData.get("financialYear") ?? ""),
      taxRegime: String(formData.get("taxRegime") ?? "new"),
      ppf: Number(formData.get("ppf") ?? 0),
      elss: Number(formData.get("elss") ?? 0),
      lic: Number(formData.get("lic") ?? 0),
      nsc: Number(formData.get("nsc") ?? 0),
      ulip: Number(formData.get("ulip") ?? 0),
      homeLoanPrincipal: Number(formData.get("homeLoanPrincipal") ?? 0),
      tuitionFees: Number(formData.get("tuitionFees") ?? 0),
      other80c: Number(formData.get("other80c") ?? 0),
      medicalSelf: Number(formData.get("medicalSelf") ?? 0),
      medicalParents: Number(formData.get("medicalParents") ?? 0),
      monthlyRent: Number(formData.get("monthlyRent") ?? 0),
      isMetro: formData.get("isMetro") === "1",
      homeLoanInterest: Number(formData.get("homeLoanInterest") ?? 0),
      nps80ccd1b: Number(formData.get("nps80ccd1b") ?? 0),
      otherDeductions: Number(formData.get("otherDeductions") ?? 0),
      submit: intent === "submit",
    };
    await callCoreHrmsApi({
      request, env: context.cloudflare.env, currentUser,
      path: "/api/it-declarations", method: "POST", body,
    });
    return { ok: true, submitted: intent === "submit" };
  }

  if (intent === "approve") {
    const id = String(formData.get("id") ?? "");
    await callCoreHrmsApi({
      request, env: context.cloudflare.env, currentUser,
      path: `/api/it-declarations/${id}/approve`, method: "PATCH",
    });
    return { ok: true };
  }

  return { ok: false };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

const FIELD_LABEL: Record<string, string> = {
  ppf: "PPF",
  elss: "ELSS / Mutual Fund",
  lic: "LIC Premium",
  nsc: "NSC",
  ulip: "ULIP",
  homeLoanPrincipal: "Home Loan Principal",
  tuitionFees: "Tuition Fees (children)",
  other80c: "Other 80C",
  medicalSelf: "Medical Insurance (self)",
  medicalParents: "Medical Insurance (parents)",
  monthlyRent: "Monthly Rent Paid",
  homeLoanInterest: "Home Loan Interest (annual)",
  nps80ccd1b: "Additional NPS 80CCD(1B)",
  otherDeductions: "Other Deductions",
};

function cap(label: string, max: number) {
  return `${label} (max ${fmt(max)})`;
}

/** Client-side TDS preview using New Regime. */
function newRegimeTDS(annualGross: number): number {
  const taxable = Math.max(0, annualGross - 75_000);
  if (taxable <= 1_200_000) return 0;
  const slabs = [[400_000,0],[800_000,0.05],[1_200_000,0.10],[1_600_000,0.15],[2_000_000,0.20],[2_400_000,0.25],[Infinity,0.30]] as const;
  let tax = 0; let prev = 0;
  for (const [upto, rate] of slabs) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, upto) - prev) * rate;
    prev = upto;
  }
  return Math.round(tax * 1.04);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ITDeclarationPage() {
  const { currentUser, isAdmin, declaration, allDeclarations, financialYear, annualCtc } = useLoaderData<LoaderData>();
  const fetcher = useFetcher<{ ok: boolean; submitted?: boolean }>();
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = useCallback((msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    if (fetcher.data?.ok) {
      showToast(
        fetcher.data.submitted ? "Declaration submitted for HR review." : "Draft saved successfully.",
        true,
      );
    }
  }, [fetcher.data, showToast]);

  // ── Form state ──
  const d = declaration;
  const [regime, setRegime] = useState<"new" | "old">((d?.tax_regime as "new" | "old") ?? "new");
  const [fields, setFields] = useState({
    ppf: d?.ppf ?? 0, elss: d?.elss ?? 0, lic: d?.lic ?? 0, nsc: d?.nsc ?? 0,
    ulip: d?.ulip ?? 0, homeLoanPrincipal: d?.home_loan_principal ?? 0,
    tuitionFees: d?.tuition_fees ?? 0, other80c: d?.other_80c ?? 0,
    medicalSelf: d?.medical_self ?? 0, medicalParents: d?.medical_parents ?? 0,
    monthlyRent: d?.monthly_rent ?? 0, isMetro: d?.is_metro === 1,
    homeLoanInterest: d?.home_loan_interest ?? 0,
    nps80ccd1b: d?.nps_80ccd1b ?? 0, otherDeductions: d?.other_deductions ?? 0,
  });

  const isLocked = d?.status === "approved";
  const isSubmitted = d?.status === "submitted";

  // ── Live TDS preview ──
  const monthlyGross = annualCtc > 0 ? (() => {
    const monthly = Math.round(annualCtc / 12);
    const basic = Math.round(monthly * 0.50);
    const hra = Math.round(monthly * 0.20);
    return basic + hra + 1_600 + Math.max(0, monthly - basic - hra - 1_600);
  })() : 0;

  const previewTDS: number = (() => {
    if (monthlyGross === 0) return 0;
    const annualGross = monthlyGross * 12;
    if (regime === "new") return Math.round(newRegimeTDS(annualGross) / 12);
    const monthly = Math.round(annualCtc / 12);
    const basic = Math.round(monthly * 0.50);
    const hra = Math.round(monthly * 0.20);
    const declForCalc: ITDeclarationForPayroll = {
      tax_regime: "old",
      ppf: fields.ppf, elss: fields.elss, lic: fields.lic, nsc: fields.nsc, ulip: fields.ulip,
      home_loan_principal: fields.homeLoanPrincipal, tuition_fees: fields.tuitionFees, other_80c: fields.other80c,
      medical_self: fields.medicalSelf, medical_parents: fields.medicalParents,
      monthly_rent: fields.monthlyRent, is_metro: fields.isMetro ? 1 : 0,
      home_loan_interest: fields.homeLoanInterest, nps_80ccd1b: fields.nps80ccd1b,
      other_deductions: fields.otherDeductions,
    };
    return Math.round(computeOldRegimeTDS(annualGross, basic, hra, declForCalc) / 12);
  })();

  const newTDS = monthlyGross > 0 ? Math.round(newRegimeTDS(monthlyGross * 12) / 12) : 0;
  const saving = newTDS - previewTDS;

  function numField(key: keyof typeof fields) {
    const val = fields[key];
    if (typeof val === "boolean") return null;
    return (
      <div key={key} style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
          {FIELD_LABEL[key] ?? key}
        </label>
        <input
          type="number" min={0} step={1000}
          value={val as number}
          disabled={isLocked || isSubmitted}
          onChange={(e) => setFields((f) => ({ ...f, [key]: Math.max(0, Number(e.target.value)) }))}
          style={{
            width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 7,
            fontSize: 13, background: (isLocked || isSubmitted) ? "#f9fafb" : "white",
          }}
        />
      </div>
    );
  }

  // ── Admin view ──
  if (isAdmin) {
    return (
      <HRMSLayout currentUser={currentUser}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>IT Declarations — FY {financialYear}</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>Review and approve employee investment declarations.</p>
          {allDeclarations.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#6b7280", background: "#f9fafb", borderRadius: 12 }}>
              No declarations submitted yet for FY {financialYear}.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
                    {["Employee", "Regime", "80C Total", "80D Total", "Monthly Rent", "Status", "Action"].map((h) => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allDeclarations.map((decl) => {
                    const c80 = (decl.ppf ?? 0) + (decl.elss ?? 0) + (decl.lic ?? 0) + (decl.nsc ?? 0) + (decl.ulip ?? 0)
                      + (decl.home_loan_principal ?? 0) + (decl.tuition_fees ?? 0) + (decl.other_80c ?? 0);
                    const d80 = (decl.medical_self ?? 0) + (decl.medical_parents ?? 0);
                    const statusColor: Record<string, { bg: string; color: string }> = {
                      approved: { bg: "#d1fae5", color: "#065f46" },
                      submitted: { bg: "#fef3c7", color: "#92400e" },
                      draft:     { bg: "#f3f4f6", color: "#6b7280" },
                    };
                    const sc = statusColor[decl.status ?? "draft"] ?? statusColor.draft;
                    return (
                      <tr key={decl.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "10px 14px", fontWeight: 600 }}>{decl.user_name}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                            background: decl.tax_regime === "old" ? "#ede9fe" : "#dbeafe",
                            color: decl.tax_regime === "old" ? "#5b21b6" : "#1e40af" }}>
                            {decl.tax_regime === "old" ? "Old" : "New"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px" }}>{fmt(Math.min(c80, 150_000))}</td>
                        <td style={{ padding: "10px 14px" }}>{fmt(Math.min(d80, 50_000))}</td>
                        <td style={{ padding: "10px 14px" }}>{decl.monthly_rent ? fmt(decl.monthly_rent) + "/mo" : "—"}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                            textTransform: "capitalize", background: sc.bg, color: sc.color }}>
                            {decl.status}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px" }}>
                          {decl.status === "submitted" ? (
                            <fetcher.Form method="post">
                              <input type="hidden" name="intent" value="approve" />
                              <input type="hidden" name="id" value={decl.id} />
                              <button type="submit" style={{
                                padding: "5px 14px", borderRadius: 7, border: "none",
                                background: "#4f46e5", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer",
                              }}>Approve</button>
                            </fetcher.Form>
                          ) : decl.status === "approved" ? (
                            <span style={{ fontSize: 12, color: "#059669", fontWeight: 600 }}>✓ Approved</span>
                          ) : (
                            <span style={{ fontSize: 12, color: "#9ca3af" }}>—</span>
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
      </HRMSLayout>
    );
  }

  // ── Employee self-service view ──
  return (
    <HRMSLayout currentUser={currentUser}>
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

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>IT Investment Declaration</h1>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>
              Financial Year: <strong>FY {financialYear}</strong> ·{" "}
              {isLocked
                ? <span style={{ color: "#059669", fontWeight: 600 }}>✓ Approved by HR</span>
                : isSubmitted
                ? <span style={{ color: "#d97706", fontWeight: 600 }}>Pending HR Approval</span>
                : d?.status === "draft"
                ? <span style={{ color: "#6b7280" }}>Draft saved</span>
                : <span style={{ color: "#6b7280" }}>Not started</span>}
            </p>
          </div>

          {/* Live TDS preview card */}
          {annualCtc > 0 && (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 18px", minWidth: 200 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", marginBottom: 6 }}>Monthly TDS Preview</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#065f46" }}>{fmt(previewTDS)}</div>
              {regime === "old" && saving > 0 && (
                <div style={{ fontSize: 11, color: "#059669", fontWeight: 600, marginTop: 4 }}>
                  ↓ Save {fmt(saving * 12)}/yr vs New Regime
                </div>
              )}
              {regime === "old" && saving < 0 && (
                <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 600, marginTop: 4 }}>
                  ↑ {fmt(Math.abs(saving) * 12)}/yr more than New Regime
                </div>
              )}
            </div>
          )}
        </div>

        <fetcher.Form method="post">
          <input type="hidden" name="financialYear" value={financialYear} />
          <input type="hidden" name="taxRegime" value={regime} />
          {/* Serialize all field values as hidden inputs */}
          {(Object.keys(fields) as Array<keyof typeof fields>).map((k) => (
            k === "isMetro"
              ? <input key={k} type="hidden" name="isMetro" value={fields.isMetro ? "1" : "0"} />
              : <input key={k} type="hidden" name={k} value={String(fields[k])} />
          ))}

          {/* ── Section 1: Tax Regime ── */}
          <section style={sectionStyle}>
            <h2 style={sectionHeader}>Tax Regime Selection</h2>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              {(["new", "old"] as const).map((r) => (
                <label key={r} style={{
                  flex: 1, minWidth: 220, display: "flex", alignItems: "flex-start", gap: 12,
                  padding: 16, border: `2px solid ${regime === r ? "#6366f1" : "#e5e7eb"}`,
                  borderRadius: 10, cursor: isLocked || isSubmitted ? "not-allowed" : "pointer",
                  background: regime === r ? "#eef2ff" : "white",
                }}>
                  <input type="radio" name="_regime" value={r} checked={regime === r}
                    disabled={isLocked || isSubmitted}
                    onChange={() => setRegime(r)}
                    style={{ marginTop: 3, accentColor: "#6366f1" }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>
                      {r === "new" ? "New Tax Regime" : "Old Tax Regime"}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                      {r === "new"
                        ? "Standard deduction ₹75,000. Lower slabs. No investment deductions."
                        : "Standard deduction ₹50,000. Higher slabs. Claim 80C, 80D, HRA, 24(b) etc."}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </section>

          {/* ── Old Regime Sections ── */}
          {regime === "old" && (
            <>
              {/* 80C */}
              <section style={sectionStyle}>
                <h2 style={sectionHeader}>
                  Section 80C Investments
                  <span style={subLimitStyle}>Annual limit: ₹1,50,000</span>
                </h2>
                <div style={gridStyle}>
                  {(["ppf","elss","lic","nsc","ulip","homeLoanPrincipal","tuitionFees","other80c"] as const).map((k) => numField(k))}
                </div>
                {(() => {
                  const total = fields.ppf + fields.elss + fields.lic + fields.nsc + fields.ulip
                    + fields.homeLoanPrincipal + fields.tuitionFees + fields.other80c;
                  const effective = Math.min(total, 150_000);
                  return (
                    <div style={{ marginTop: 8, fontSize: 12, color: total > 150_000 ? "#dc2626" : "#374151", fontWeight: 600 }}>
                      Declared: {fmt(total)} → Effective: {fmt(effective)}
                      {total > 150_000 && " (capped at ₹1,50,000)"}
                    </div>
                  );
                })()}
              </section>

              {/* 80D */}
              <section style={sectionStyle}>
                <h2 style={sectionHeader}>
                  Section 80D — Health Insurance
                  <span style={subLimitStyle}>Self: ₹25,000 · Parents: ₹25,000</span>
                </h2>
                <div style={gridStyle}>
                  {numField("medicalSelf")}
                  {numField("medicalParents")}
                </div>
              </section>

              {/* HRA */}
              <section style={sectionStyle}>
                <h2 style={sectionHeader}>HRA Exemption</h2>
                <div style={gridStyle}>
                  {numField("monthlyRent")}
                  {fields.monthlyRent > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
                        City Type
                      </label>
                      <select
                        value={fields.isMetro ? "metro" : "nonmetro"}
                        disabled={isLocked || isSubmitted}
                        onChange={(e) => setFields((f) => ({ ...f, isMetro: e.target.value === "metro" }))}
                        style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 13 }}
                      >
                        <option value="metro">Metro (Mumbai, Delhi, Chennai, Kolkata) — 50% of Basic</option>
                        <option value="nonmetro">Non-Metro — 40% of Basic</option>
                      </select>
                    </div>
                  )}
                </div>
                {fields.monthlyRent === 0 && (
                  <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>Enter monthly rent to compute HRA exemption.</p>
                )}
              </section>

              {/* 24(b) + NPS + Other */}
              <section style={sectionStyle}>
                <h2 style={sectionHeader}>Other Deductions</h2>
                <div style={gridStyle}>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
                      {cap("Home Loan Interest (Sec 24b)", 200_000)}
                    </label>
                    <input type="number" min={0} step={1000} value={fields.homeLoanInterest}
                      disabled={isLocked || isSubmitted}
                      onChange={(e) => setFields((f) => ({ ...f, homeLoanInterest: Math.max(0, Number(e.target.value)) }))}
                      style={inputStyle(isLocked || isSubmitted)} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
                      {cap("Additional NPS 80CCD(1B)", 50_000)}
                    </label>
                    <input type="number" min={0} step={1000} value={fields.nps80ccd1b}
                      disabled={isLocked || isSubmitted}
                      onChange={(e) => setFields((f) => ({ ...f, nps80ccd1b: Math.max(0, Number(e.target.value)) }))}
                      style={inputStyle(isLocked || isSubmitted)} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
                      Other Deductions
                    </label>
                    <input type="number" min={0} step={1000} value={fields.otherDeductions}
                      disabled={isLocked || isSubmitted}
                      onChange={(e) => setFields((f) => ({ ...f, otherDeductions: Math.max(0, Number(e.target.value)) }))}
                      style={inputStyle(isLocked || isSubmitted)} />
                  </div>
                </div>
              </section>
            </>
          )}

          {/* ── Actions ── */}
          {!isLocked && !isSubmitted && (
            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <button
                type="submit" name="intent" value="save"
                disabled={fetcher.state !== "idle"}
                style={{ padding: "10px 24px", borderRadius: 8, border: "1px solid #e5e7eb",
                  background: "white", fontWeight: 600, fontSize: 14, cursor: "pointer", color: "#374151" }}
              >
                {fetcher.state !== "idle" ? "Saving…" : "💾 Save Draft"}
              </button>
              <button
                type="submit" name="intent" value="submit"
                disabled={fetcher.state !== "idle"}
                style={{ padding: "10px 24px", borderRadius: 8, border: "none",
                  background: "#4f46e5", color: "white", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
              >
                {fetcher.state !== "idle" ? "Submitting…" : "✔ Submit for HR Review"}
              </button>
            </div>
          )}

          {isSubmitted && (
            <div style={{ marginTop: 8, padding: "12px 16px", background: "#fefce8", border: "1px solid #fde68a", borderRadius: 8, fontSize: 13, color: "#92400e" }}>
              ⏳ Your declaration has been submitted and is awaiting HR approval. Contact HR if you need to make changes.
            </div>
          )}
        </fetcher.Form>
      </div>
    </HRMSLayout>
  );
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  background: "white", border: "1px solid #e5e7eb", borderRadius: 10,
  padding: "20px 20px 16px", marginBottom: 16,
};
const sectionHeader: React.CSSProperties = {
  fontSize: 14, fontWeight: 700, color: "#111827", margin: "0 0 14px", display: "flex",
  justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8,
};
const subLimitStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "#6366f1", background: "#eef2ff",
  padding: "2px 8px", borderRadius: 20,
};
const gridStyle: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0 16px",
};
function inputStyle(disabled: boolean): React.CSSProperties {
  return {
    width: "100%", padding: "8px 10px", border: "1px solid #d1d5db",
    borderRadius: 7, fontSize: 13, background: disabled ? "#f9fafb" : "white",
  };
}
