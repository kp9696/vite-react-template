import { useState, useEffect, useRef } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.documents";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import { isAdminRole } from "../lib/hrms.shared";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Document {
  id: string;
  employee_id: string;
  employee_name: string;
  category: string;
  name: string;
  file_key: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: string;
  uploaded_by_name: string;
  created_at: string;
}

const CATEGORIES = [
  { value: "offer-letter",   label: "Offer Letter",    icon: "📄" },
  { value: "id-proof",       label: "ID Proof",        icon: "🪪" },
  { value: "address-proof",  label: "Address Proof",   icon: "🏠" },
  { value: "certificate",    label: "Certificate",     icon: "🎓" },
  { value: "payslip",        label: "Payslip",         icon: "💰" },
  { value: "contract",       label: "Contract",        icon: "📋" },
  { value: "other",          label: "Other",           icon: "📎" },
] as const;

type Category = typeof CATEGORIES[number]["value"];

const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.value, c]));

function fmtSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
  });
}

function mimeIcon(mime: string | null): string {
  if (!mime) return "📎";
  if (mime.startsWith("image/")) return "🖼️";
  if (mime === "application/pdf") return "📕";
  if (mime.includes("word") || mime.includes("document")) return "📝";
  if (mime.includes("sheet") || mime.includes("excel")) return "📊";
  return "📎";
}

// ── Meta ──────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "JWithKP HRMS - Documents" }];
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const isAdmin = isAdminRole(currentUser.role);

  const url = new URL(request.url);
  const employeeFilter = url.searchParams.get("emp") ?? "";

  const docsRes = await callCoreHrmsApi<{ documents: Document[] }>({
    request,
    env: context.cloudflare.env,
    currentUser,
    path: `/api/documents${isAdmin && employeeFilter ? `?employeeId=${employeeFilter}` : ""}`,
  });

  return {
    currentUser,
    isAdmin,
    documents: docsRes?.documents ?? [],
    employeeFilter,
    baseUrl: context.cloudflare.env.HRMS_BASE_URL ?? "",
  };
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "presign") {
    const result = await callCoreHrmsApi<{ uploadToken: string; fileKey: string }>({
      request, env: context.cloudflare.env, currentUser,
      path: "/api/documents/presign", method: "POST",
      body: {
        fileName: String(formData.get("fileName") || ""),
        mimeType: String(formData.get("mimeType") || "application/octet-stream"),
        employeeId: String(formData.get("employeeId") || currentUser.id),
      },
    });
    return { ok: !!result?.uploadToken, intent, uploadToken: result?.uploadToken, fileKey: result?.fileKey };
  }

  if (intent === "save") {
    const result = await callCoreHrmsApi<{ ok: boolean; id: string }>({
      request, env: context.cloudflare.env, currentUser,
      path: "/api/documents", method: "POST",
      body: {
        employeeId: String(formData.get("employeeId") || currentUser.id),
        category: String(formData.get("category") || "other"),
        name: String(formData.get("name") || ""),
        fileKey: String(formData.get("fileKey") || ""),
        fileSize: Number(formData.get("fileSize") || 0),
        mimeType: String(formData.get("mimeType") || ""),
      },
    });
    return { ok: result?.ok ?? false, intent, message: result?.ok ? "Document saved." : "Failed to save." };
  }

  if (intent === "delete") {
    const id = String(formData.get("id") || "");
    const result = await callCoreHrmsApi<{ ok: boolean }>({
      request, env: context.cloudflare.env, currentUser,
      path: `/api/documents/${id}`, method: "DELETE",
    });
    return { ok: result?.ok ?? false, intent, message: result?.ok ? "Deleted." : "Failed to delete." };
  }

  return { ok: false, intent };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { currentUser, isAdmin, documents, baseUrl } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok: boolean; intent: string; message?: string; uploadToken?: string; fileKey?: string }>();

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category | "all">("all");

  // Upload form state
  const [showUpload, setShowUpload] = useState(false);
  const [docName, setDocName] = useState("");
  const [category, setCategory] = useState<Category>("other");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Upload token flow: after presign response, upload directly to R2 proxy
  useEffect(() => {
    if (fetcher.data?.intent === "presign" && fetcher.data.uploadToken && selectedFile) {
      handleDirectUpload(fetcher.data.uploadToken, fetcher.data.fileKey!, selectedFile);
    }
  }, [fetcher.data]);

  // Toast
  useEffect(() => {
    if (fetcher.data?.message) {
      setToast({ msg: fetcher.data.message, ok: fetcher.data.ok });
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [fetcher.data]);

  // Reset form on success save
  useEffect(() => {
    if (fetcher.data?.ok && fetcher.data.intent === "save") {
      setDocName(""); setCategory("other"); setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
      setShowUpload(false);
    }
  }, [fetcher.data]);

  async function handleDirectUpload(token: string, fileKey: string, file: File) {
    setUploading(true);
    setUploadProgress(0);
    try {
      const uploadUrl = `${baseUrl}/api/documents/upload/${encodeURIComponent(token)}`;
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        setUploading(false);
        if (xhr.status === 200) {
          // Save metadata
          const fd = new FormData();
          fd.set("intent", "save");
          fd.set("employeeId", currentUser.id);
          fd.set("category", category);
          fd.set("name", docName || file.name);
          fd.set("fileKey", fileKey);
          fd.set("fileSize", String(file.size));
          fd.set("mimeType", file.type);
          fetcher.submit(fd, { method: "post" });
        } else {
          setToast({ msg: "Upload failed. Please try again.", ok: false });
        }
      };
      xhr.onerror = () => {
        setUploading(false);
        setToast({ msg: "Upload failed. Check your connection.", ok: false });
      };
      xhr.send(file);
    } catch {
      setUploading(false);
      setToast({ msg: "Upload failed.", ok: false });
    }
  }

  function startUpload() {
    if (!selectedFile) return;
    const fd = new FormData();
    fd.set("intent", "presign");
    fd.set("fileName", selectedFile.name);
    fd.set("mimeType", selectedFile.type || "application/octet-stream");
    fd.set("employeeId", currentUser.id);
    fetcher.submit(fd, { method: "post" });
  }

  // Download handler
  async function handleDownload(doc: Document) {
    const link = document.createElement("a");
    link.href = `${baseUrl}/api/documents/${doc.id}/download`;
    link.setAttribute("download", doc.name);
    // Need auth — open in fetch with token from cookie session
    // Simplest: navigate directly (server will auth via cookie session through loader)
    window.open(`/api/documents/${doc.id}/download`, "_blank");
  }

  const filtered = activeCategory === "all"
    ? documents
    : documents.filter(d => d.category === activeCategory);

  // Group by category for display
  const byCategory: Record<string, Document[]> = {};
  for (const d of filtered) {
    if (!byCategory[d.category]) byCategory[d.category] = [];
    byCategory[d.category].push(d);
  }

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

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>Documents</h1>
            <p style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>
              {isAdmin ? "Manage all employee documents in one place." : "Your personal document vault."}
            </p>
          </div>
          <button onClick={() => setShowUpload(v => !v)} style={{
            background: showUpload ? "#e5e7eb" : "#4f46e5",
            color: showUpload ? "#374151" : "#fff",
            border: "none", borderRadius: 8, padding: "9px 18px",
            fontWeight: 600, fontSize: 14, cursor: "pointer",
          }}>
            {showUpload ? "✕ Cancel" : "⬆ Upload Document"}
          </button>
        </div>

        {/* Upload panel */}
        {showUpload && (
          <div style={{ background: "#fff", border: "2px solid #4f46e5", borderRadius: 12, padding: 24, marginBottom: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "0 0 16px" }}>Upload New Document</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <label style={lbl}>
                <span style={lblTxt}>Document Name</span>
                <input value={docName} onChange={e => setDocName(e.target.value)}
                  placeholder="e.g. Aadhar Card, Offer Letter 2024…" style={inp} />
              </label>
              <label style={lbl}>
                <span style={lblTxt}>Category</span>
                <select value={category} onChange={e => setCategory(e.target.value as Category)} style={inp}>
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                  ))}
                </select>
              </label>
              <label style={lbl}>
                <span style={lblTxt}>File</span>
                <input ref={fileRef} type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx,.txt"
                  onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
                  style={{ ...inp, padding: "6px 10px" }} />
                <span style={{ fontSize: 11, color: "#9ca3af" }}>PDF, Word, Excel, Images up to 10 MB</span>
              </label>

              {/* Progress bar */}
              {uploading && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
                    <span>Uploading…</span><span>{uploadProgress}%</span>
                  </div>
                  <div style={{ width: "100%", background: "#e5e7eb", borderRadius: 99, height: 6 }}>
                    <div style={{ width: `${uploadProgress}%`, background: "#4f46e5", height: 6, borderRadius: 99, transition: "width 0.2s" }} />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={startUpload}
                disabled={!selectedFile || uploading || fetcher.state !== "idle"}
                style={{
                  background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8,
                  padding: "9px 22px", fontWeight: 600, fontSize: 14, cursor: "pointer",
                  alignSelf: "flex-start",
                  opacity: !selectedFile || uploading ? 0.6 : 1,
                }}
              >
                {uploading ? `Uploading… ${uploadProgress}%` : "Upload"}
              </button>
            </div>
          </div>
        )}

        {/* Category filter pills */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          <button onClick={() => setActiveCategory("all")} style={pill(activeCategory === "all")}>
            All ({documents.length})
          </button>
          {CATEGORIES.filter(c => documents.some(d => d.category === c.value)).map(c => (
            <button key={c.value} onClick={() => setActiveCategory(c.value)} style={pill(activeCategory === c.value)}>
              {c.icon} {c.label} ({documents.filter(d => d.category === c.value).length})
            </button>
          ))}
        </div>

        {/* Empty state */}
        {documents.length === 0 && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "50px 20px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📁</div>
            <div style={{ fontWeight: 600, fontSize: 15, color: "#374151", marginBottom: 6 }}>No documents yet</div>
            <div style={{ color: "#9ca3af", fontSize: 13 }}>Upload your first document using the button above.</div>
          </div>
        )}

        {/* Document groups */}
        {Object.entries(byCategory).map(([cat, docs]) => {
          const catMeta = CAT_MAP[cat] ?? { icon: "📎", label: cat };
          return (
            <div key={cat} style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 18 }}>{catMeta.icon}</span>
                <span style={{ fontWeight: 700, fontSize: 14, color: "#374151" }}>{catMeta.label}</span>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>({docs.length})</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {docs.map(doc => (
                  <div key={doc.id} style={{
                    background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
                    padding: "14px 18px", display: "flex", alignItems: "center", gap: 14,
                    transition: "box-shadow 0.15s",
                  }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.07)")}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
                  >
                    {/* File icon */}
                    <div style={{
                      width: 40, height: 40, borderRadius: 8, background: "#f3f4f6",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 20, flexShrink: 0,
                    }}>
                      {mimeIcon(doc.mime_type)}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {doc.name}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                        {isAdmin && <span style={{ marginRight: 10 }}>👤 {doc.employee_name}</span>}
                        {fmtSize(doc.file_size)} · {fmtDate(doc.created_at)}
                        {doc.uploaded_by_name && <span> · Uploaded by {doc.uploaded_by_name}</span>}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                      <button
                        onClick={() => handleDownload(doc)}
                        style={{
                          background: "#ede9fe", color: "#6d28d9", border: "none",
                          borderRadius: 6, padding: "5px 12px", fontSize: 12,
                          fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        ⬇ Download
                      </button>

                      {(isAdmin || doc.employee_id === currentUser.id) && (
                        confirmDeleteId === doc.id ? (
                          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ fontSize: 11, color: "#ef4444" }}>Delete?</span>
                            <fetcher.Form method="post" style={{ display: "inline" }}>
                              <input type="hidden" name="intent" value="delete" />
                              <input type="hidden" name="id" value={doc.id} />
                              <button type="submit" onClick={() => setConfirmDeleteId(null)} style={dangerBtn}>Yes</button>
                            </fetcher.Form>
                            <button onClick={() => setConfirmDeleteId(null)} style={cancelBtn}>No</button>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmDeleteId(doc.id)} style={ghostDangerBtn}>Delete</button>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </HRMSLayout>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pill(active: boolean): React.CSSProperties {
  return {
    background: active ? "#4f46e5" : "#f3f4f6",
    color: active ? "#fff" : "#374151",
    border: active ? "none" : "1px solid #e5e7eb",
    borderRadius: 999, padding: "4px 14px", fontSize: 12,
    fontWeight: active ? 700 : 500, cursor: "pointer",
    transition: "all 0.15s",
  };
}

// ── Styles ────────────────────────────────────────────────────────────────────

const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const lblTxt: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#374151" };
const inp: React.CSSProperties = { padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, color: "#111827", background: "#fff", outline: "none", width: "100%", boxSizing: "border-box" };
const dangerBtn: React.CSSProperties = { background: "#ef4444", color: "#fff", border: "none", borderRadius: 5, padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" };
const cancelBtn: React.CSSProperties = { background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 5, padding: "3px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" };
const ghostDangerBtn: React.CSSProperties = { background: "transparent", border: "1px solid #fca5a5", borderRadius: 6, color: "#ef4444", padding: "4px 10px", fontSize: 12, cursor: "pointer" };
