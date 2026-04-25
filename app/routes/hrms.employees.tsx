import { useEffect, useRef, useState } from "react";
import { Link, redirect, useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.employees";
import HRMSLayout from "../components/HRMSLayout";
import {
  bulkImportEmployees,
  createOrUpdateInvitedUser,
  deleteUser,
  getOrganizationById,
  getOrganizationMemberUsage,
  listUsers,
  updateUserDetails,
} from "../lib/hrms.server";
import type { HRMSUser, ImportEmployeeRow, ImportResult } from "../lib/hrms.server";
import { sendInviteEmail } from "../lib/invite-email.server";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { isAdminRole, avatarColor, getInitials } from "../lib/hrms.shared";

const roles = ["Employee", "Manager", "HR Manager", "HR Admin", "Finance", "Payroll Manager"];
const departments = ["Engineering", "Design", "Analytics", "Sales", "People Ops", "Marketing", "Finance", "Operations", "General"];
const genders = ["Male", "Female", "Other", "Prefer not to say"];
const employmentTypes = ["Full-time", "Part-time", "Contract", "Intern", "Consultant"];

type ActionResult = {
  ok: boolean;
  message: string;
  type: "success" | "error";
  importResult?: ImportResult;
};

export function meta() {
  return [{ title: "JWithKP HRMS - Employees" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const tenantId = currentUser.companyId;
  if (!tenantId) throw redirect("/hrms");
  const isAdmin = isAdminRole(currentUser.role);

  const organization = await getOrganizationById(context.cloudflare.env.HRMS, tenantId);
  const users = await listUsers(context.cloudflare.env.HRMS, tenantId);
  const memberUsage = isAdmin ? await getOrganizationMemberUsage(context.cloudflare.env.HRMS, tenantId) : 0;

  return { currentUser, isAdmin, organization, users, memberUsage };
}

export async function action({ request, context }: Route.ActionArgs): Promise<ActionResult> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const tenantId = currentUser.companyId;
  if (!tenantId || !isAdminRole(currentUser.role)) {
    return { ok: false, type: "error", message: "Only admins can manage employees." };
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const db = context.cloudflare.env.HRMS;
  const organization = await getOrganizationById(db, tenantId);
  if (!organization) return { ok: false, type: "error", message: "Organization not found." };

  try {
    if (intent === "invite") {
      const memberUsage = await getOrganizationMemberUsage(db, tenantId);
      if (memberUsage >= organization.inviteLimit) {
        return { ok: false, type: "error", message: `Invite limit reached (${organization.inviteLimit} seats).` };
      }
      const payload = {
        companyId: tenantId,
        name:           String(formData.get("name") || "").trim(),
        email:          String(formData.get("email") || "").trim(),
        role:           String(formData.get("role") || "Employee"),
        department:     String(formData.get("department") || "Engineering"),
        designation:    String(formData.get("designation") || ""),
        phone:          String(formData.get("phone") || ""),
        gender:         String(formData.get("gender") || ""),
        dob:            String(formData.get("dob") || ""),
        employmentType: String(formData.get("employmentType") || "Full-time"),
        joinedOn:       String(formData.get("joinedOn") || ""),
      };
      if (!payload.name || !payload.email) {
        return { ok: false, type: "error", message: "Name and work email are required." };
      }
      const user = await createOrUpdateInvitedUser(db, payload);
      const mailResult = await sendInviteEmail(context.cloudflare.env, db, user.id, payload, request.url);
      return {
        ok: mailResult.delivered,
        type: mailResult.delivered ? "success" : "error",
        message: mailResult.delivered ? mailResult.message : `${mailResult.message} Record saved.`,
      };
    }

    if (intent === "resend") {
      const userId     = String(formData.get("userId") || "");
      const name       = String(formData.get("name") || "").trim();
      const email      = String(formData.get("email") || "").trim();
      const role       = String(formData.get("role") || "Employee");
      const department = String(formData.get("department") || "Engineering");
      if (!userId || !email) return { ok: false, type: "error", message: "User details incomplete." };
      const mailResult = await sendInviteEmail(context.cloudflare.env, db, userId, { name, email, role, department }, request.url);
      return { ok: mailResult.delivered, type: mailResult.delivered ? "success" : "error", message: mailResult.message };
    }

    if (intent === "edit") {
      const userId = String(formData.get("userId") || "");
      if (!userId) return { ok: false, type: "error", message: "User ID required." };
      if (userId === currentUser.id && String(formData.get("role") || "") !== currentUser.role) {
        return { ok: false, type: "error", message: "You cannot change your own role." };
      }
      await updateUserDetails(db, userId, tenantId, {
        name:           String(formData.get("name") || "").trim() || undefined,
        role:           String(formData.get("role") || "").trim() || undefined,
        department:     String(formData.get("department") || "").trim() || undefined,
        designation:    String(formData.get("designation") || "").trim() || undefined,
        phone:          String(formData.get("phone") || "").trim() || undefined,
        gender:         String(formData.get("gender") || "").trim() || undefined,
        dob:            String(formData.get("dob") || "").trim() || undefined,
        employmentType: String(formData.get("employmentType") || "").trim() || undefined,
        joinedOn:       String(formData.get("joinedOn") || "").trim() || undefined,
      });
      return { ok: true, type: "success", message: "Employee details updated." };
    }

    if (intent === "delete") {
      const userId = String(formData.get("userId") || "");
      if (!userId) return { ok: false, type: "error", message: "User ID required." };
      if (userId === currentUser.id) return { ok: false, type: "error", message: "You cannot delete your own account." };
      await deleteUser(db, userId, tenantId);
      return { ok: true, type: "success", message: "Employee removed successfully." };
    }

    if (intent === "csv-import") {
      const rowsJson = String(formData.get("rowsJson") || "[]");
      const skipDuplicates = formData.get("skipDuplicates") !== "false";
      let rows: ImportEmployeeRow[];
      try {
        rows = JSON.parse(rowsJson);
        if (!Array.isArray(rows)) throw new Error("Invalid rows");
      } catch {
        return { ok: false, type: "error", message: "Could not parse import data." };
      }
      if (rows.length === 0) return { ok: false, type: "error", message: "No rows to import." };
      if (rows.length > 500) return { ok: false, type: "error", message: "Maximum 500 employees per import." };

      const result = await bulkImportEmployees(
        db,
        tenantId,
        rows,
        skipDuplicates,
        organization.inviteLimit,
      );

      if (result.imported === 0 && result.errors.length > 0) {
        return { ok: false, type: "error", message: `Import failed — ${result.errors.length} error(s). See details below.`, importResult: result };
      }
      const msg = `Imported ${result.imported} employee(s)${result.skipped > 0 ? `, skipped ${result.skipped} duplicate(s)` : ""}${result.errors.length > 0 ? `, ${result.errors.length} row error(s)` : ""}.`;
      return { ok: true, type: "success", message: msg, importResult: result };
    }

    return { ok: false, type: "error", message: "Unknown action." };
  } catch (error) {
    return { ok: false, type: "error", message: error instanceof Error ? error.message : "Something went wrong." };
  }
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

const CSV_COLUMNS = ["name", "email", "role", "department", "designation", "phone", "gender", "dob", "employmentType", "joinedOn"] as const;
const CSV_TEMPLATE_HEADER = CSV_COLUMNS.join(",");
const CSV_TEMPLATE_EXAMPLE = `Priya Sharma,priya.sharma@company.com,Employee,Engineering,Software Engineer,9876543210,Female,1995-06-15,Full-time,2024-01-10
Rahul Verma,rahul.verma@company.com,Manager,Sales,Sales Manager,9123456789,Male,1988-03-22,Full-time,2023-07-01`;

function downloadCsvTemplate() {
  const content = [CSV_TEMPLATE_HEADER, CSV_TEMPLATE_EXAMPLE].join("\n");
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "employee_import_template.csv";
  a.click(); URL.revokeObjectURL(url);
}

function parseCsv(text: string): ImportEmployeeRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length === 0) return [];

  // Detect header row
  const firstLine = lines[0].toLowerCase().replace(/\s/g, "");
  const hasHeader = firstLine.includes("name") || firstLine.includes("email");
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines
    .filter((l) => l.trim())
    .map((line) => {
      // Simple CSV parser: handles quoted fields
      const fields: string[] = [];
      let cur = ""; let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuote = !inQuote; }
        else if (ch === "," && !inQuote) { fields.push(cur.trim()); cur = ""; }
        else { cur += ch; }
      }
      fields.push(cur.trim());
      const [name = "", email = "", role = "", department = "", designation = "", phone = "", gender = "", dob = "", employmentType = "", joinedOn = ""] = fields;
      return { name, email, role: role || undefined, department: department || undefined, designation: designation || undefined, phone: phone || undefined, gender: gender || undefined, dob: dob || undefined, employmentType: employmentType || undefined, joinedOn: joinedOn || undefined };
    })
    .filter((r) => r.name || r.email);
}

// ── Import Modal ───────────────────────────────────────────────────────────────

function ImportModal({ onClose, fetcher }: { onClose: () => void; fetcher: ReturnType<typeof useFetcher<ActionResult>> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportEmployeeRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const submitting = fetcher.state !== "idle";
  const result = fetcher.data?.importResult;
  const isDone = fetcher.data?.ok !== undefined && fetcher.state === "idle" && result !== undefined;

  const PREVIEW_LIMIT = 8;
  const preview = rows.slice(0, PREVIEW_LIMIT);

  function handleFile(file: File) {
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      setParseError("Please select a .csv file."); return;
    }
    setParseError(""); setRows([]); setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parseCsv(e.target?.result as string);
        if (parsed.length === 0) { setParseError("No data rows found. Make sure the file has at least one row below the header."); return; }
        if (parsed.length > 500) { setParseError("Maximum 500 rows per import."); return; }
        setRows(parsed);
      } catch {
        setParseError("Could not parse the CSV file.");
      }
    };
    reader.readAsText(file);
  }

  function handleSubmit() {
    if (rows.length === 0 || submitting) return;
    const fd = new FormData();
    fd.set("intent", "csv-import");
    fd.set("rowsJson", JSON.stringify(rows));
    fd.set("skipDuplicates", String(skipDuplicates));
    fetcher.submit(fd, { method: "POST" });
  }

  const ovStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" };
  const boxStyle: React.CSSProperties = { background: "white", borderRadius: 18, width: 760, maxWidth: "calc(100vw - 32px)", maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", border: "1px solid #e2e8f0" };
  const hdrStyle: React.CSSProperties = { padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", background: "linear-gradient(135deg,#0ea5e9,#6366f1)", flexShrink: 0 };
  const bodyStyle: React.CSSProperties = { padding: "24px", overflowY: "auto", flex: 1 };
  const lblSt: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 5, textTransform: "uppercase" as const, letterSpacing: 0.5 };

  return (
    <div style={ovStyle} onClick={onClose}>
      <div style={boxStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={hdrStyle}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "white", letterSpacing: -0.3 }}>Import Employees from CSV</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>Bulk-add up to 500 employees · Status set to "Invited"</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "white", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 18, display: "grid", placeItems: "center" }}>×</button>
        </div>

        <div style={bodyStyle}>
          {/* Done state — show result */}
          {isDone && result ? (
            <div>
              <div style={{ padding: "16px 20px", borderRadius: 12, background: fetcher.data?.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${fetcher.data?.ok ? "#bbf7d0" : "#fecaca"}`, marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: fetcher.data?.ok ? "#15803d" : "#dc2626", marginBottom: 6 }}>
                  {fetcher.data?.ok ? "✓ Import complete" : "Import finished with errors"}
                </div>
                <div style={{ fontSize: 13, color: "#334155", display: "flex", gap: 20, flexWrap: "wrap" }}>
                  <span>✅ <strong>{result.imported}</strong> imported</span>
                  {result.skipped > 0 && <span>⏭ <strong>{result.skipped}</strong> skipped (duplicates)</span>}
                  {result.errors.length > 0 && <span>⚠ <strong>{result.errors.length}</strong> row error(s)</span>}
                </div>
              </div>
              {result.errors.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8, textTransform: "uppercase" }}>Row Errors</div>
                  <div style={{ maxHeight: 200, overflowY: "auto", borderRadius: 8, border: "1px solid #fecaca", background: "#fef2f2" }}>
                    {result.errors.map((e, i) => (
                      <div key={i} style={{ padding: "8px 12px", fontSize: 12, borderBottom: i < result.errors.length - 1 ? "1px solid #fecaca" : "none", color: "#7f1d1d" }}>
                        {e.row > 0 ? `Row ${e.row}` : "—"}{e.email ? ` · ${e.email}` : ""} — {e.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#0ea5e9,#6366f1)", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
                <button onClick={() => { setRows([]); setFileName(""); fetcher.load?.(""); }} style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "white", color: "#334155", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Import another file</button>
              </div>
            </div>
          ) : (
            <>
              {/* Step 1 — template */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>Step 1 — Download the template</div>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                  Columns: <code style={{ background: "#f1f5f9", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>{CSV_TEMPLATE_HEADER}</code>
                </div>
                <button onClick={downloadCsvTemplate} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "white", color: "#334155", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download Template CSV
                </button>
              </div>

              {/* Step 2 — file upload */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>Step 2 — Upload your CSV</div>
                <div
                  style={{ border: "2px dashed #cbd5e1", borderRadius: 12, padding: "24px", textAlign: "center", cursor: "pointer", background: "#f8fafc" }}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                >
                  <svg style={{ margin: "0 auto 8px", display: "block", color: "#94a3b8" }} width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{fileName ? fileName : "Click to select or drag & drop your CSV"}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>Max 500 rows · .csv only</div>
                  <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                </div>
                {parseError && <div style={{ marginTop: 8, fontSize: 12, color: "#dc2626" }}>{parseError}</div>}
              </div>

              {/* Step 3 — preview */}
              {rows.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
                    Step 3 — Preview ({rows.length} row{rows.length !== 1 ? "s" : ""})
                  </div>
                  <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #e2e8f0" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          {["#", "Name", "Email", "Role", "Department", "Designation", "Employment Type", "Joining Date"].map((h) => (
                            <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700, color: "#64748b", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((r, i) => {
                          const missingName = !r.name?.trim();
                          const missingEmail = !r.email?.trim();
                          const hasError = missingName || missingEmail;
                          return (
                            <tr key={i} style={{ background: hasError ? "#fef2f2" : "white", borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "7px 10px", color: "#94a3b8" }}>{i + 1}</td>
                              <td style={{ padding: "7px 10px", fontWeight: 600, color: missingName ? "#dc2626" : "#0f172a" }}>{r.name || <em style={{ color: "#dc2626" }}>missing</em>}</td>
                              <td style={{ padding: "7px 10px", color: missingEmail ? "#dc2626" : "#334155" }}>{r.email || <em style={{ color: "#dc2626" }}>missing</em>}</td>
                              <td style={{ padding: "7px 10px", color: "#334155" }}>{r.role || <span style={{ color: "#94a3b8" }}>Employee</span>}</td>
                              <td style={{ padding: "7px 10px", color: "#334155" }}>{r.department || <span style={{ color: "#94a3b8" }}>General</span>}</td>
                              <td style={{ padding: "7px 10px", color: "#64748b" }}>{r.designation || "—"}</td>
                              <td style={{ padding: "7px 10px", color: "#64748b" }}>{r.employmentType || <span style={{ color: "#94a3b8" }}>Full-time</span>}</td>
                              <td style={{ padding: "7px 10px", color: "#64748b" }}>{r.joinedOn || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {rows.length > PREVIEW_LIMIT && (
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, textAlign: "center" }}>
                      … and {rows.length - PREVIEW_LIMIT} more row(s) not shown
                    </div>
                  )}
                </div>
              )}

              {/* Options + submit */}
              {rows.length > 0 && (
                <div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#334155", cursor: "pointer", marginBottom: 20, userSelect: "none" as const }}>
                    <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} style={{ width: 15, height: 15 }} />
                    <span><strong>Skip duplicate emails</strong> — rows whose email already exists will be silently skipped</span>
                  </label>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      disabled={submitting}
                      onClick={handleSubmit}
                      style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: submitting ? "#cbd5e1" : "linear-gradient(135deg,#0ea5e9,#6366f1)", color: "white", fontWeight: 700, fontSize: 13, cursor: submitting ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                      {submitting ? `Importing ${rows.length} employee(s)…` : `Import ${rows.length} Employee${rows.length !== 1 ? "s" : ""}`}
                    </button>
                    <button onClick={onClose} style={{ padding: "10px 18px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "white", color: "#64748b", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────
const inputSt: React.CSSProperties = {
  width: "100%", padding: "9px 12px", border: "1.5px solid #e2e8f0",
  borderRadius: 8, fontSize: 13, background: "white", fontFamily: "inherit",
  color: "#0f172a", outline: "none", boxSizing: "border-box",
};
const selectSt: React.CSSProperties = { ...inputSt, cursor: "pointer" };

function FL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</label>
      {children}
    </div>
  );
}

// ── Add / Edit Modal ───────────────────────────────────────────────────────────
function EmployeeModal({ mode, user, memberUsage, inviteLimit, onClose, fetcher }: {
  mode: "add" | "edit";
  user?: HRMSUser;
  memberUsage: number;
  inviteLimit: number;
  onClose: () => void;
  fetcher: ReturnType<typeof useFetcher>;
}) {
  const isAdd = mode === "add";
  const submitting = fetcher.state !== "idle";
  const today = new Date().toISOString().split("T")[0];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "white", borderRadius: 18, width: 640, maxWidth: "calc(100vw - 32px)", maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", border: "1px solid #e2e8f0" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", background: isAdd ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "linear-gradient(135deg,#0f172a,#1e293b)", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "white", letterSpacing: -0.3 }}>{isAdd ? "Invite New Employee" : `Edit — ${user?.name}`}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{isAdd ? `${memberUsage} / ${inviteLimit} seats used · An invite email will be sent` : `ID: ${user?.id} · ${user?.role}`}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.12)", border: "none", color: "white", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 18, display: "grid", placeItems: "center" }}>×</button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: "auto", flex: 1, padding: 24 }}>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value={isAdd ? "invite" : "edit"} />
            {!isAdd && <input type="hidden" name="userId" value={user?.id} />}

            {/* Personal */}
            <div style={{ fontSize: 11, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ height: 1, flex: 1, background: "#e2e8f0" }} /> Personal Information <span style={{ height: 1, flex: 1, background: "#e2e8f0" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
              <FL label="Full Name *"><input name="name" defaultValue={user?.name} placeholder="e.g. Kiran Sharma" style={inputSt} required /></FL>
              {isAdd && <FL label="Work Email *"><input name="email" type="email" placeholder="employee@company.com" style={inputSt} required /></FL>}
              <FL label="Mobile Phone"><input name="phone" type="tel" defaultValue={user?.phone ?? ""} placeholder="+91 98765 43210" style={inputSt} /></FL>
              <FL label="Date of Birth"><input name="dob" type="date" defaultValue={user?.dob ?? ""} max={today} style={inputSt} /></FL>
              <FL label="Gender">
                <select name="gender" defaultValue={user?.gender ?? ""} style={selectSt}>
                  <option value="">Select gender</option>
                  {genders.map((g) => <option key={g}>{g}</option>)}
                </select>
              </FL>
            </div>

            {/* Work */}
            <div style={{ fontSize: 11, fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ height: 1, flex: 1, background: "#e2e8f0" }} /> Work Information <span style={{ height: 1, flex: 1, background: "#e2e8f0" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
              <FL label="Role / Access Level">
                <select name="role" defaultValue={user?.role ?? "Employee"} style={selectSt}>
                  {roles.map((r) => <option key={r}>{r}</option>)}
                </select>
              </FL>
              <FL label="Department">
                <select name="department" defaultValue={user?.department ?? "Engineering"} style={selectSt}>
                  {departments.map((d) => <option key={d}>{d}</option>)}
                </select>
              </FL>
              <FL label="Designation / Job Title"><input name="designation" defaultValue={user?.designation ?? ""} placeholder="e.g. Senior Engineer" style={inputSt} /></FL>
              <FL label="Employment Type">
                <select name="employmentType" defaultValue={user?.employmentType ?? "Full-time"} style={selectSt}>
                  {employmentTypes.map((t) => <option key={t}>{t}</option>)}
                </select>
              </FL>
              <FL label="Date of Joining"><input name="joinedOn" type="date" defaultValue={user?.joinedOn ?? ""} max={today} style={inputSt} /></FL>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" onClick={onClose} style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "white", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button type="submit" disabled={submitting} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: isAdd ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "linear-gradient(135deg,#0f172a,#334155)", color: "white", fontWeight: 700, fontSize: 13, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1, fontFamily: "inherit" }}>
                {submitting ? "Saving…" : isAdd ? "Send Invite →" : "Save Changes"}
              </button>
            </div>
          </fetcher.Form>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirmation Modal ──────────────────────────────────────────────────
function DeleteModal({ user, onClose, fetcher }: { user: HRMSUser; onClose: () => void; fetcher: ReturnType<typeof useFetcher> }) {
  const [confirm, setConfirm] = useState("");
  const submitting = fetcher.state !== "idle";
  const ready = confirm === user.name;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "white", borderRadius: 18, width: 440, maxWidth: "calc(100vw - 32px)", padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#fef2f2", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <svg width="20" height="20" fill="none" stroke="#ef4444" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>Remove Employee</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>This permanently deletes their account and all data.</div>
          </div>
        </div>

        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 14px", marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#dc2626" }}>{user.name}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{user.email} · {user.role} · {user.department}</div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 6 }}>
            Type <strong style={{ color: "#dc2626" }}>{user.name}</strong> to confirm
          </label>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={user.name} autoFocus style={{ ...inputSt, borderColor: ready ? "#ef4444" : "#e2e8f0" }} />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, borderRadius: 10, border: "1.5px solid #e2e8f0", background: "white", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <fetcher.Form method="post" style={{ flex: 1 }}>
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="userId" value={user.id} />
            <button type="submit" disabled={!ready || submitting} style={{ width: "100%", padding: 10, borderRadius: 10, border: "none", background: ready ? "#ef4444" : "#fca5a5", color: "white", fontWeight: 700, fontSize: 13, cursor: ready && !submitting ? "pointer" : "not-allowed", fontFamily: "inherit", transition: "background 0.15s" }}>
              {submitting ? "Deleting…" : "Delete Employee"}
            </button>
          </fetcher.Form>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function EmployeesPage() {
  const { currentUser, isAdmin, organization, users, memberUsage } = useLoaderData<typeof loader>();
  const actionFetcher = useFetcher<ActionResult>();
  const resendFetcher = useFetcher<ActionResult>();
  const importFetcher = useFetcher<ActionResult>();

  const [modal, setModal] = useState<null | "add" | "edit" | "delete" | "import">(null);
  const [selectedUser, setSelectedUser] = useState<HRMSUser | null>(null);
  const [toast, setToast] = useState<ActionResult | null>(null);
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");

  const seatsLeft = Math.max((organization?.inviteLimit ?? 0) - memberUsage, 0);

  useEffect(() => {
    const d = actionFetcher.data;
    if (!d) return;
    setToast(d);
    if (d.ok) { setModal(null); setSelectedUser(null); }
  }, [actionFetcher.data]);

  useEffect(() => { if (resendFetcher.data) setToast(resendFetcher.data); }, [resendFetcher.data]);

  useEffect(() => {
    const d = importFetcher.data;
    if (!d) return;
    if (d.ok || d.type === "error") setToast(d);
  }, [importFetcher.data]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.designation ?? "").toLowerCase().includes(q);
    const matchDept = filterDept === "All" || u.department === filterDept;
    const matchStatus = filterStatus === "All" || u.status === filterStatus;
    return matchSearch && matchDept && matchStatus;
  });

  // ── Employee read-only directory ──────────────────────────────────────────
  if (!isAdmin) {
    const filteredDir = users.filter((u) => {
      const q = search.toLowerCase();
      return !q || u.name.toLowerCase().includes(q) || (u.designation ?? "").toLowerCase().includes(q) || (u.department ?? "").toLowerCase().includes(q);
    });
    return (
      <HRMSLayout currentUser={currentUser}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <div className="page-title">Employee Directory</div>
            <div className="page-sub">{organization?.name ?? "Your Organisation"} · {users.length} team member{users.length !== 1 ? "s" : ""}</div>
          </div>
        </div>
        {/* Search */}
        <div style={{ position: "relative", maxWidth: 360, marginBottom: 24 }}>
          <svg style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }} width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, role or department…" style={{ width: "100%", padding: "9px 12px 9px 34px", border: "1.5px solid var(--border)", borderRadius: 10, fontSize: 13, background: "white", color: "var(--ink)", fontFamily: "inherit" }} />
        </div>
        {/* Cards grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {filteredDir.map((u) => {
            const color = avatarColor(u.name);
            const initials = getInitials(u.name);
            const isSelf = u.id === currentUser.id;
            return (
              <div key={u.id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: "20px 18px", textAlign: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: color, display: "grid", placeItems: "center", fontSize: 16, fontWeight: 700, color: "white", margin: "0 auto 12px" }}>{initials}</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", marginBottom: 2 }}>
                  {u.name}
                  {isSelf && <span style={{ marginLeft: 6, fontSize: 10, color: "#6366f1", fontWeight: 600, background: "#eef2ff", padding: "1px 6px", borderRadius: 20 }}>You</span>}
                </div>
                {u.designation && <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 4 }}>{u.designation}</div>}
                <div style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, display: "inline-block", background: "#eff6ff", color: "#2563eb", marginBottom: 8 }}>{u.department ?? "—"}</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4 }}>{u.employmentType ?? "Full-time"}</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 2 }}>{u.email}</div>
                <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>{u.id}</div>
              </div>
            );
          })}
        </div>
        {filteredDir.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">👥</div>
            <div className="empty-state-title">No results found</div>
            <div className="empty-state-sub">Try a different search term.</div>
          </div>
        )}
      </HRMSLayout>
    );
  }

  return (
    <HRMSLayout currentUser={currentUser}>
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderRadius: 12, fontSize: 13, fontWeight: 600, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", minWidth: 240, background: toast.type === "success" ? "#f0fdf4" : "#fef2f2", color: toast.type === "success" ? "#15803d" : "#dc2626", border: `1px solid ${toast.type === "success" ? "#bbf7d0" : "#fecaca"}` }}>
          {toast.type === "success" ? "✓" : "✕"} {toast.message}
        </div>
      )}

      {/* Modals */}
      {(modal === "add" || modal === "edit") && (
        <EmployeeModal mode={modal} user={selectedUser ?? undefined} memberUsage={memberUsage} inviteLimit={organization?.inviteLimit ?? 5} onClose={() => { setModal(null); setSelectedUser(null); }} fetcher={actionFetcher} />
      )}
      {modal === "delete" && selectedUser && (
        <DeleteModal user={selectedUser} onClose={() => { setModal(null); setSelectedUser(null); }} fetcher={actionFetcher} />
      )}
      {modal === "import" && (
        <ImportModal onClose={() => setModal(null)} fetcher={importFetcher} />
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div className="page-title">Employees</div>
          <div className="page-sub">{organization?.name ?? "Your Organisation"} · {users.length} total · {seatsLeft} seats available</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => setModal("import")}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "white", color: "#334155", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Import CSV
          </button>
          <button
            onClick={() => { setSelectedUser(null); setModal("add"); }}
            disabled={seatsLeft === 0}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 10, border: "none", background: seatsLeft === 0 ? "#e2e8f0" : "linear-gradient(135deg,#6366f1,#8b5cf6)", color: seatsLeft === 0 ? "#94a3b8" : "white", fontWeight: 700, fontSize: 13, cursor: seatsLeft === 0 ? "not-allowed" : "pointer", boxShadow: seatsLeft === 0 ? "none" : "0 4px 14px rgba(99,102,241,0.35)", fontFamily: "inherit" }}
          >
            <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            Invite Employee
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
        {[
          { label: "Total", value: users.length, color: "#6366f1" },
          { label: "Admins", value: users.filter((u) => isAdminRole(u.role)).length, color: "#ef4444" },
          { label: "Active", value: users.filter((u) => u.status === "Active").length, color: "#10b981" },
          { label: "Invited", value: users.filter((u) => u.status === "Invited").length, color: "#f59e0b" },
        ].map((s) => (
          <div key={s.label} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: "18px 20px", borderLeft: `4px solid ${s.color}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <svg style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }} width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or designation…" style={{ ...inputSt, paddingLeft: 34, borderRadius: 10 }} />
        </div>
        <select value={filterDept} onChange={(e) => setFilterDept(e.target.value)} style={{ ...selectSt, width: "auto", minWidth: 160 }}>
          <option value="All">All Departments</option>
          {departments.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ ...selectSt, width: "auto", minWidth: 130 }}>
          <option value="All">All Statuses</option>
          <option>Active</option>
          <option>Invited</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
              {["Employee", "Email", "Role", "Dept & Title", "Type", "Status", "Actions"].map((h) => (
                <th key={h} style={{ fontSize: 10.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.7, padding: "10px 14px", textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: "48px 0", color: "#94a3b8" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#475569", marginBottom: 4 }}>No employees yet</div>
                <div style={{ fontSize: 13, color: "#94a3b8" }}>Click "Invite Employee" to add your first team member</div>
              </td></tr>
            ) : filtered.map((user) => {
              const color = avatarColor(user.name);
              const initials = getInitials(user.name);
              const isAdmin = isAdminRole(user.role);
              const isSelf = user.id === currentUser.id;
              return (
                <tr key={user.id} style={{ borderBottom: "1px solid #f1f5f9", transition: "background 0.1s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f8faff")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                  {/* Clickable name cell → profile page */}
                  <td style={{ padding: "14px 14px" }}>
                    <Link to={`/hrms/profile/${user.id}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: color, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: "white", flexShrink: 0 }}>{initials}</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", display: "flex", alignItems: "center", gap: 6 }}>
                          {user.name}
                          {isSelf && <span style={{ fontSize: 10, color: "#6366f1", fontWeight: 600, background: "#eef2ff", padding: "1px 6px", borderRadius: 20 }}>You</span>}
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{user.id}</div>
                      </div>
                    </Link>
                  </td>
                  <td style={{ padding: "14px 14px", fontSize: 13, color: "#475569" }}>{user.email}</td>
                  <td style={{ padding: "14px 14px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: isAdmin ? "#fef2f2" : "#eff6ff", color: isAdmin ? "#dc2626" : "#2563eb" }}>{user.role}</span>
                  </td>
                  <td style={{ padding: "14px 14px" }}>
                    <div style={{ fontSize: 13, color: "#0f172a", fontWeight: 500 }}>{user.department}</div>
                    {user.designation && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{user.designation}</div>}
                  </td>
                  <td style={{ padding: "14px 14px", fontSize: 13, color: "#475569" }}>{user.employmentType ?? "Full-time"}</td>
                  <td style={{ padding: "14px 14px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: user.status === "Active" ? "#ecfdf5" : "#fffbeb", color: user.status === "Active" ? "#059669" : "#d97706" }}>{user.status}</span>
                  </td>
                  <td style={{ padding: "14px 14px" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedUser(user); setModal("edit"); }}
                        style={{ padding: "5px 12px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "white", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#475569", fontFamily: "inherit" }}
                      >Edit</button>
                      {user.status === "Invited" && (
                        <resendFetcher.Form method="post">
                          <input type="hidden" name="intent" value="resend" />
                          <input type="hidden" name="userId" value={user.id} />
                          <input type="hidden" name="name" value={user.name} />
                          <input type="hidden" name="email" value={user.email} />
                          <input type="hidden" name="role" value={user.role} />
                          <input type="hidden" name="department" value={user.department} />
                          <button type="submit" disabled={resendFetcher.state !== "idle"} style={{ padding: "5px 12px", borderRadius: 8, border: "1.5px solid #c7d2fe", background: "#eef2ff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#6366f1", fontFamily: "inherit" }}>Resend</button>
                        </resendFetcher.Form>
                      )}
                      {!isSelf && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedUser(user); setModal("delete"); }}
                          style={{ padding: "5px 10px", borderRadius: 8, border: "1.5px solid #fecaca", background: "#fef2f2", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#dc2626", fontFamily: "inherit", display: "flex", alignItems: "center" }}
                        >
                          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </HRMSLayout>
  );
}
