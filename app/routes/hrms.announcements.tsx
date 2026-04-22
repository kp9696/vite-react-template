import { useState, useEffect } from "react";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import type { Route } from "./+types/hrms.announcements";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import { isAdminRole } from "../lib/hrms.shared";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Announcement {
  id: string;
  title: string;
  body: string;
  priority: "normal" | "important" | "urgent";
  pinned: boolean;
  author_id: string;
  author_name: string;
  created_at: string;
  isRead: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function canPost(role: string) {
  const r = role.toLowerCase();
  return r.includes("admin") || r.includes("hr");
}

function priorityConfig(p: string) {
  if (p === "urgent") return { label: "Urgent", bg: "#fef2f2", border: "#fca5a5", badge: "#ef4444", text: "#991b1b" };
  if (p === "important") return { label: "Important", bg: "#fffbeb", border: "#fde68a", badge: "#f59e0b", text: "#92400e" };
  return { label: "Normal", bg: "#f9fafb", border: "#e5e7eb", badge: "#6b7280", text: "#374151" };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

// ── Meta ──────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "JWithKP HRMS - Announcements" }];
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);

  const res = await callCoreHrmsApi<{ announcements: Announcement[]; unreadCount: number }>({
    request,
    env: context.cloudflare.env,
    currentUser,
    path: "/api/announcements",
  });

  return {
    currentUser,
    canPost: canPost(currentUser.role),
    announcements: res?.announcements ?? [],
    unreadCount: res?.unreadCount ?? 0,
  };
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "create") {
    const result = await callCoreHrmsApi<{ ok: boolean; id?: string }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: "/api/announcements",
      method: "POST",
      body: {
        title: String(formData.get("title") || "").trim(),
        body: String(formData.get("body") || "").trim(),
        priority: String(formData.get("priority") || "normal"),
        pinned: formData.get("pinned") === "true",
      },
    });
    return { ok: result?.ok ?? false, intent, message: result?.ok ? "Announcement posted." : "Failed to post." };
  }

  if (intent === "delete") {
    const id = String(formData.get("id") || "");
    const result = await callCoreHrmsApi<{ ok: boolean }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: `/api/announcements/${id}`,
      method: "DELETE",
    });
    return { ok: result?.ok ?? false, intent, message: result?.ok ? "Deleted." : "Failed to delete." };
  }

  if (intent === "read") {
    const id = String(formData.get("id") || "");
    await callCoreHrmsApi<{ ok: boolean }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: `/api/announcements/${id}/read`,
      method: "POST",
    });
    return { ok: true, intent };
  }

  if (intent === "pin") {
    const id = String(formData.get("id") || "");
    const result = await callCoreHrmsApi<{ ok: boolean; pinned: boolean }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: `/api/announcements/${id}/pin`,
      method: "PATCH",
    });
    return { ok: result?.ok ?? false, intent };
  }

  return { ok: false, intent, message: "Unknown action." };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AnnouncementsPage() {
  const { currentUser, canPost: userCanPost, announcements, unreadCount } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok: boolean; intent: string; message?: string }>();
  const revalidator = useRevalidator();

  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("normal");
  const [pinned, setPinned] = useState(false);

  // Toast on action result
  useEffect(() => {
    if (fetcher.data?.message) {
      setToast({ msg: fetcher.data.message, ok: fetcher.data.ok });
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [fetcher.data]);

  // Reset form after successful create
  useEffect(() => {
    if (fetcher.data?.ok && fetcher.data.intent === "create") {
      setTitle("");
      setBody("");
      setPriority("normal");
      setPinned(false);
      setShowForm(false);
    }
  }, [fetcher.data]);

  const submitting = fetcher.state !== "idle";
  const creating = submitting && fetcher.formData?.get("intent") === "create";

  // Auto mark as read when expanding
  function handleExpand(id: string, isRead: boolean) {
    setExpanded((prev) => (prev === id ? null : id));
    if (!isRead) {
      const fd = new FormData();
      fd.set("intent", "read");
      fd.set("id", id);
      fetcher.submit(fd, { method: "post" });
    }
  }

  return (
    <HRMSLayout currentUser={currentUser}>
      {/* Toast */}
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

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 20px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }}>
              Announcements
              {unreadCount > 0 && (
                <span style={{
                  marginLeft: 10, background: "#ef4444", color: "#fff",
                  borderRadius: 999, padding: "2px 9px", fontSize: 13, fontWeight: 700,
                  verticalAlign: "middle",
                }}>
                  {unreadCount} new
                </span>
              )}
            </h1>
            <p style={{ color: "#6b7280", fontSize: 14, marginTop: 4 }}>
              Company-wide updates from your HR &amp; leadership team.
            </p>
          </div>
          {userCanPost && (
            <button
              onClick={() => setShowForm((v) => !v)}
              style={{
                background: showForm ? "#e5e7eb" : "#4f46e5",
                color: showForm ? "#374151" : "#fff",
                border: "none", borderRadius: 8, padding: "9px 18px",
                fontWeight: 600, fontSize: 14, cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {showForm ? "✕ Cancel" : "+ New Announcement"}
            </button>
          )}
        </div>

        {/* Compose form */}
        {showForm && userCanPost && (
          <div style={{
            background: "#fff", border: "2px solid #4f46e5", borderRadius: 12,
            padding: 24, marginBottom: 24,
          }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "0 0 16px" }}>
              Post New Announcement
            </h2>
            <fetcher.Form method="post" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <input type="hidden" name="intent" value="create" />

              <input
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Announcement title *"
                required
                style={inputStyle}
              />

              <textarea
                name="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your message here… *"
                required
                rows={4}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
              />

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                {/* Priority */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Priority:</span>
                  {(["normal", "important", "urgent"] as const).map((p) => {
                    const cfg = priorityConfig(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        style={{
                          padding: "4px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600,
                          cursor: "pointer", border: `1.5px solid ${priority === p ? cfg.badge : "#d1d5db"}`,
                          background: priority === p ? cfg.bg : "#fff",
                          color: priority === p ? cfg.text : "#6b7280",
                          transition: "all 0.15s",
                        }}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                  <input type="hidden" name="priority" value={priority} />
                </div>

                {/* Pin toggle */}
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#374151" }}>
                  <input
                    type="checkbox"
                    checked={pinned}
                    onChange={(e) => setPinned(e.target.checked)}
                    style={{ width: 15, height: 15, accentColor: "#4f46e5" }}
                  />
                  📌 Pin to top
                  <input type="hidden" name="pinned" value={String(pinned)} />
                </label>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={creating || !title.trim() || !body.trim()}
                  style={{
                    background: "#4f46e5", color: "#fff", border: "none",
                    borderRadius: 8, padding: "9px 22px", fontWeight: 600, fontSize: 14,
                    cursor: creating || !title.trim() || !body.trim() ? "not-allowed" : "pointer",
                    opacity: creating || !title.trim() || !body.trim() ? 0.6 : 1,
                  }}
                >
                  {creating ? "Posting…" : "Post Announcement"}
                </button>
              </div>
            </fetcher.Form>
          </div>
        )}

        {/* Empty state */}
        {announcements.length === 0 && (
          <div style={{
            background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12,
            padding: "60px 20px", textAlign: "center",
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📢</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
              No announcements yet
            </div>
            <div style={{ color: "#9ca3af", fontSize: 14 }}>
              {userCanPost
                ? "Post an announcement to broadcast updates to your team."
                : "Your team hasn't posted any announcements yet."}
            </div>
          </div>
        )}

        {/* Announcement cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {announcements.map((ann) => {
            const cfg = priorityConfig(ann.priority);
            const isExpanded = expanded === ann.id;
            const isUnread = !ann.isRead;

            return (
              <div
                key={ann.id}
                style={{
                  background: cfg.bg,
                  border: `1.5px solid ${isUnread ? cfg.badge : cfg.border}`,
                  borderRadius: 12,
                  overflow: "hidden",
                  transition: "box-shadow 0.15s",
                  boxShadow: isUnread ? `0 0 0 3px ${cfg.badge}22` : "none",
                }}
              >
                {/* Card header */}
                <div
                  style={{ padding: "14px 18px", cursor: "pointer", display: "flex", gap: 12, alignItems: "flex-start" }}
                  onClick={() => handleExpand(ann.id, ann.isRead)}
                >
                  {/* Priority dot */}
                  <div style={{
                    width: 10, height: 10, borderRadius: "50%", background: cfg.badge,
                    marginTop: 5, flexShrink: 0,
                  }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {ann.pinned && (
                        <span style={{ fontSize: 13 }}>📌</span>
                      )}
                      <span style={{
                        fontWeight: isUnread ? 700 : 600,
                        fontSize: 15,
                        color: "#111827",
                        flex: 1,
                      }}>
                        {ann.title}
                      </span>
                      {isUnread && (
                        <span style={{
                          background: cfg.badge, color: "#fff",
                          borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 700,
                          flexShrink: 0,
                        }}>
                          NEW
                        </span>
                      )}
                      <span style={{
                        background: cfg.bg, color: cfg.text,
                        border: `1px solid ${cfg.badge}`, borderRadius: 999,
                        padding: "1px 8px", fontSize: 11, fontWeight: 600,
                        flexShrink: 0,
                      }}>
                        {cfg.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 3 }}>
                      {ann.author_name} · {timeAgo(ann.created_at)}
                    </div>
                  </div>

                  {/* Expand chevron */}
                  <svg
                    width="16" height="16" fill="none" stroke="#9ca3af" strokeWidth="2"
                    viewBox="0 0 24 24"
                    style={{ flexShrink: 0, transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "none" }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>

                {/* Expanded body */}
                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${cfg.border}`, padding: "16px 18px 18px 40px" }}>
                    <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                      {ann.body}
                    </div>

                    {/* Admin actions */}
                    {userCanPost && (
                      <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
                        {/* Pin / Unpin */}
                        <fetcher.Form method="post" style={{ display: "inline" }}>
                          <input type="hidden" name="intent" value="pin" />
                          <input type="hidden" name="id" value={ann.id} />
                          <button
                            type="submit"
                            style={{
                              background: "transparent",
                              border: `1px solid ${ann.pinned ? "#f59e0b" : "#d1d5db"}`,
                              borderRadius: 6, padding: "4px 12px", fontSize: 12,
                              fontWeight: 600, cursor: "pointer",
                              color: ann.pinned ? "#92400e" : "#6b7280",
                            }}
                          >
                            {ann.pinned ? "📌 Unpin" : "📌 Pin"}
                          </button>
                        </fetcher.Form>

                        {/* Delete */}
                        {confirmDeleteId === ann.id ? (
                          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                            <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 500 }}>Delete this?</span>
                            <fetcher.Form method="post" style={{ display: "inline" }}>
                              <input type="hidden" name="intent" value="delete" />
                              <input type="hidden" name="id" value={ann.id} />
                              <button
                                type="submit"
                                onClick={() => setConfirmDeleteId(null)}
                                style={{
                                  background: "#ef4444", color: "#fff", border: "none",
                                  borderRadius: 6, padding: "4px 12px", fontSize: 12,
                                  fontWeight: 600, cursor: "pointer",
                                }}
                              >
                                Yes, delete
                              </button>
                            </fetcher.Form>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              style={{
                                background: "#e5e7eb", color: "#374151", border: "none",
                                borderRadius: 6, padding: "4px 12px", fontSize: 12,
                                fontWeight: 600, cursor: "pointer",
                              }}
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(ann.id)}
                            style={{
                              background: "transparent",
                              border: "1px solid #fca5a5", borderRadius: 6, padding: "4px 12px",
                              fontSize: 12, fontWeight: 600, color: "#ef4444", cursor: "pointer",
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </HRMSLayout>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  fontSize: 14,
  color: "#111827",
  background: "#fff",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};
