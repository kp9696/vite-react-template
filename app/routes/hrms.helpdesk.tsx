import { useFetcher, useLoaderData } from "react-router";
import { useEffect, useRef, useState } from "react";
import type { Route } from "./+types/hrms.helpdesk";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import { isAdminRole } from "../lib/hrms.shared";

// ── Types ─────────────────────────────────────────────────────────────────────

type TicketStatus = "open" | "in-progress" | "resolved" | "closed";
type TicketPriority = "low" | "medium" | "high";
type TicketCategory = "Payroll" | "Leave" | "IT" | "Facilities" | "Other";

interface HelpdeskTicket {
  id: string;
  ticket_no: string;
  title: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  created_by_id: string;
  created_by_name: string;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface HelpdeskComment {
  id: string;
  author_id: string;
  author_name: string;
  author_role: string;
  body: string;
  created_at: string;
}

interface ActionResult {
  ok?: boolean;
  error?: string;
  id?: string;
  ticketNo?: string;
  status?: string;
  comments?: HelpdeskComment[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: TicketStatus) {
  const map: Record<TicketStatus, { label: string; cls: string }> = {
    open:        { label: "Open",        cls: "badge-blue"  },
    "in-progress": { label: "In Progress", cls: "badge-amber" },
    resolved:    { label: "Resolved",    cls: "badge-green" },
    closed:      { label: "Closed",      cls: "badge-slate" },
  };
  const b = map[status] ?? { label: status, cls: "badge-slate" };
  return <span className={`badge ${b.cls}`}>{b.label}</span>;
}

function priorityBadge(priority: TicketPriority) {
  const map: Record<TicketPriority, { label: string; cls: string }> = {
    low:    { label: "Low",    cls: "badge-slate" },
    medium: { label: "Medium", cls: "badge-amber" },
    high:   { label: "High",   cls: "badge-red"   },
  };
  const b = map[priority] ?? { label: priority, cls: "badge-slate" };
  return <span className={`badge ${b.cls}`}>{b.label}</span>;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const CATEGORIES: TicketCategory[] = ["Payroll", "Leave", "IT", "Facilities", "Other"];
const PRIORITIES: TicketPriority[] = ["low", "medium", "high"];
const STATUSES: TicketStatus[] = ["open", "in-progress", "resolved", "closed"];

const CAT_ICON: Record<TicketCategory, string> = {
  Payroll:    "💰",
  Leave:      "📅",
  IT:         "💻",
  Facilities: "🏢",
  Other:      "📋",
};

// ── Meta ──────────────────────────────────────────────────────────────────────

export function meta() {
  return [{ title: "JWithKP HRMS - Help Desk" }];
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const isManager = isAdminRole(currentUser.role);

  const res = await callCoreHrmsApi<{ tickets?: HelpdeskTicket[] }>({
    request,
    env: context.cloudflare.env,
    currentUser,
    path: "/api/helpdesk/tickets",
  });

  return { currentUser, isManager, tickets: res?.tickets ?? [] };
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs): Promise<ActionResult> {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "create-ticket") {
    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const category = String(formData.get("category") || "Other").trim();
    const priority = String(formData.get("priority") || "medium").trim();

    if (!title || !description) {
      return { error: "Title and description are required." };
    }

    const res = await callCoreHrmsApi<ActionResult>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: "/api/helpdesk/tickets",
      method: "POST",
      body: { title, description, category, priority },
    });

    if (!res?.ok) return { error: res?.error || "Failed to create ticket." };
    return { ok: true, id: res.id, ticketNo: res.ticketNo };
  }

  if (intent === "update-ticket") {
    const id = String(formData.get("id") || "").trim();
    const status = String(formData.get("status") || "").trim() || undefined;
    const assignedToId = String(formData.get("assignedToId") || "").trim() || undefined;
    const assignedToName = String(formData.get("assignedToName") || "").trim() || undefined;
    const priority = String(formData.get("priority") || "").trim() || undefined;

    if (!id) return { error: "Invalid request." };

    const res = await callCoreHrmsApi<ActionResult>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: `/api/helpdesk/tickets/${encodeURIComponent(id)}`,
      method: "PATCH",
      body: { status, assignedToId, assignedToName, priority },
    });

    if (!res?.ok) return { error: res?.error || "Failed to update ticket." };
    return { ok: true, id, status: res.status };
  }

  if (intent === "add-comment") {
    const ticketId = String(formData.get("ticketId") || "").trim();
    const body = String(formData.get("body") || "").trim();

    if (!ticketId || !body) return { error: "Comment body is required." };

    const res = await callCoreHrmsApi<ActionResult>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: `/api/helpdesk/tickets/${encodeURIComponent(ticketId)}/comments`,
      method: "POST",
      body: { body },
    });

    if (!res?.ok) return { error: res?.error || "Failed to add comment." };
    return { ok: true, id: res.id };
  }

  if (intent === "load-comments") {
    const ticketId = String(formData.get("ticketId") || "").trim();
    if (!ticketId) return { error: "ticketId is required." };

    const res = await callCoreHrmsApi<{ comments?: HelpdeskComment[] }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: `/api/helpdesk/tickets/${encodeURIComponent(ticketId)}/comments`,
    });

    return { ok: true, comments: res?.comments ?? [] };
  }

  return { error: "Unsupported action." };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HelpdeskPage() {
  const { currentUser, isManager, tickets } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionResult>();
  const commentFetcher = useFetcher<ActionResult>();

  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [selectedTicket, setSelectedTicket] = useState<HelpdeskTicket | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterCat, setFilterCat] = useState<string>("");

  // Create ticket form state
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCat, setNewCat] = useState<TicketCategory>("Other");
  const [newPriority, setNewPriority] = useState<TicketPriority>("medium");

  // Comment state
  const [comments, setComments] = useState<HelpdeskComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const commentEndRef = useRef<HTMLDivElement>(null);

  // Admin update state
  const [updateStatus, setUpdateStatus] = useState<TicketStatus>("open");
  const [updatePriority, setUpdatePriority] = useState<TicketPriority>("medium");

  // After successful ticket creation, reset and go to list
  useEffect(() => {
    if (fetcher.data?.ok && fetcher.data.ticketNo && view === "create") {
      setView("list");
      setNewTitle(""); setNewDesc(""); setNewCat("Other"); setNewPriority("medium");
    }
  }, [fetcher.data, view]);

  // After add-comment, clear text
  useEffect(() => {
    if (fetcher.data?.ok && !fetcher.data.ticketNo && !fetcher.data.status) {
      setCommentText("");
    }
  }, [fetcher.data]);

  // When comments load (via commentFetcher), update local state
  useEffect(() => {
    if (commentFetcher.data?.comments) {
      setComments(commentFetcher.data.comments);
      setTimeout(() => commentEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }, [commentFetcher.data]);

  function openTicket(ticket: HelpdeskTicket) {
    setSelectedTicket(ticket);
    setUpdateStatus(ticket.status);
    setUpdatePriority(ticket.priority);
    setComments([]);
    setCommentText("");
    setView("detail");
    // Load comments via fetcher
    commentFetcher.submit(
      { intent: "load-comments", ticketId: ticket.id },
      { method: "POST" },
    );
  }

  const displayTickets = tickets.filter((t) => {
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterCat && t.category !== filterCat) return false;
    return true;
  });

  const openCount   = tickets.filter((t) => t.status === "open").length;
  const inProgCount = tickets.filter((t) => t.status === "in-progress").length;
  const resolvedCount = tickets.filter((t) => t.status === "resolved" || t.status === "closed").length;

  return (
    <HRMSLayout currentUser={currentUser}>
      <div style={{ padding: "24px", maxWidth: 1100, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1e293b", margin: 0 }}>🎫 HR Help Desk</h1>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
              {isManager ? "Manage employee support tickets" : "Raise and track your support requests"}
            </p>
          </div>
          {view === "list" ? (
            <button
              className="btn-primary"
              onClick={() => setView("create")}
              style={{ padding: "8px 18px", borderRadius: 8, fontSize: 14 }}
            >
              + New Ticket
            </button>
          ) : (
            <button
              onClick={() => setView("list")}
              style={{ background: "none", border: "1px solid #e2e8f0", padding: "7px 16px", borderRadius: 8, cursor: "pointer", color: "#64748b", fontSize: 14 }}
            >
              ← Back
            </button>
          )}
        </div>

        {/* ── Summary Cards ── */}
        {view === "list" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 24 }}>
            {[
              { label: "Open", count: openCount, color: "#3b82f6" },
              { label: "In Progress", count: inProgCount, color: "#f59e0b" },
              { label: "Resolved / Closed", count: resolvedCount, color: "#10b981" },
            ].map((c) => (
              <div key={c.label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 20px" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: c.color }}>{c.count}</div>
                <div style={{ fontSize: 13, color: "#64748b" }}>{c.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Create Ticket Form ── */}
        {view === "create" && (
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 28, maxWidth: 620 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, color: "#1e293b" }}>Raise a New Ticket</h2>
            <fetcher.Form method="POST">
              <input type="hidden" name="intent" value="create-ticket" />
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 6 }}>Subject *</label>
                <input
                  name="title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Brief summary of the issue"
                  required
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 6 }}>Category *</label>
                  <select
                    name="category"
                    value={newCat}
                    onChange={(e) => setNewCat(e.target.value as TicketCategory)}
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }}
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_ICON[c]} {c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 6 }}>Priority</label>
                  <select
                    name="priority"
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as TicketPriority)}
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14 }}
                  >
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 6 }}>Description *</label>
                <textarea
                  name="description"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Describe the issue in detail..."
                  required
                  rows={5}
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, resize: "vertical", boxSizing: "border-box" }}
                />
              </div>
              {fetcher.data?.error && (
                <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{fetcher.data.error}</p>
              )}
              <button
                type="submit"
                disabled={fetcher.state !== "idle"}
                className="btn-primary"
                style={{ padding: "9px 22px", borderRadius: 8, fontSize: 14 }}
              >
                {fetcher.state !== "idle" ? "Submitting…" : "Submit Ticket"}
              </button>
            </fetcher.Form>
          </div>
        )}

        {/* ── Ticket Detail ── */}
        {view === "detail" && selectedTicket && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, alignItems: "start" }}>
            {/* Left: thread */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24 }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "#94a3b8", fontFamily: "monospace" }}>{selectedTicket.ticket_no}</span>
                  {statusBadge(selectedTicket.status)}
                  {priorityBadge(selectedTicket.priority)}
                </div>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1e293b", margin: 0 }}>{selectedTicket.title}</h2>
                <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                  {CAT_ICON[selectedTicket.category]} {selectedTicket.category} · Raised by {selectedTicket.created_by_name} · {fmtDate(selectedTicket.created_at)}
                </p>
              </div>
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: 14, fontSize: 14, color: "#374151", marginBottom: 20, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {/* description is not returned in list — show a note */}
                <em style={{ color: "#94a3b8" }}>Original request — see comments below for discussion</em>
              </div>

              {/* Comments thread */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 12 }}>
                  💬 Thread ({comments.length})
                </div>
                {comments.length === 0 && (
                  <p style={{ color: "#94a3b8", fontSize: 13 }}>No replies yet. Add the first comment below.</p>
                )}
                {comments.map((c) => {
                  const isHR = isAdminRole(c.author_role);
                  return (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        gap: 10,
                        marginBottom: 14,
                        flexDirection: isHR ? "row-reverse" : "row",
                      }}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: isHR ? "#6366f1" : "#0ea5e9",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0,
                      }}>
                        {c.author_name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ maxWidth: "75%" }}>
                        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 3, textAlign: isHR ? "right" : "left" }}>
                          {c.author_name} {isHR ? "· HR" : ""} · {timeAgo(c.created_at)}
                        </div>
                        <div style={{
                          background: isHR ? "#eef2ff" : "#f1f5f9",
                          borderRadius: isHR ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                          padding: "9px 13px", fontSize: 14, color: "#1e293b", lineHeight: 1.5, whiteSpace: "pre-wrap",
                        }}>
                          {c.body}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={commentEndRef} />
              </div>

              {/* Add comment */}
              {selectedTicket.status !== "closed" && (
                <fetcher.Form method="POST" style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <input type="hidden" name="intent" value="add-comment" />
                  <input type="hidden" name="ticketId" value={selectedTicket.id} />
                  <textarea
                    name="body"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Write a reply…"
                    rows={2}
                    required
                    style={{ flex: 1, padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, resize: "none" }}
                  />
                  <button
                    type="submit"
                    disabled={fetcher.state !== "idle" || !commentText.trim()}
                    className="btn-primary"
                    style={{ padding: "9px 18px", borderRadius: 8, fontSize: 14, alignSelf: "stretch" }}
                  >
                    Send
                  </button>
                </fetcher.Form>
              )}
              {fetcher.data?.error && (
                <p style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}>{fetcher.data.error}</p>
              )}
            </div>

            {/* Right: admin panel */}
            {isManager && (
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", marginBottom: 16 }}>Manage Ticket</h3>
                <fetcher.Form method="POST">
                  <input type="hidden" name="intent" value="update-ticket" />
                  <input type="hidden" name="id" value={selectedTicket.id} />
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#64748b", marginBottom: 5 }}>Status</label>
                    <select
                      name="status"
                      value={updateStatus}
                      onChange={(e) => setUpdateStatus(e.target.value as TicketStatus)}
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 13 }}
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#64748b", marginBottom: 5 }}>Priority</label>
                    <select
                      name="priority"
                      value={updatePriority}
                      onChange={(e) => setUpdatePriority(e.target.value as TicketPriority)}
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 13 }}
                    >
                      {PRIORITIES.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#64748b", marginBottom: 5 }}>Assigned To (Name)</label>
                    <input
                      name="assignedToName"
                      defaultValue={selectedTicket.assigned_to_name ?? ""}
                      placeholder="HR team member name"
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 13, boxSizing: "border-box" }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={fetcher.state !== "idle"}
                    className="btn-primary"
                    style={{ width: "100%", padding: "9px", borderRadius: 8, fontSize: 13 }}
                  >
                    {fetcher.state !== "idle" ? "Saving…" : "Save Changes"}
                  </button>
                </fetcher.Form>

                <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #f1f5f9" }}>
                  <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.8 }}>
                    <div>Ticket No: <strong>{selectedTicket.ticket_no}</strong></div>
                    <div>Raised: {fmtDate(selectedTicket.created_at)}</div>
                    {selectedTicket.resolved_at && (
                      <div>Resolved: {fmtDate(selectedTicket.resolved_at)}</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Ticket List ── */}
        {view === "list" && (
          <>
            {/* Filters */}
            <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{ padding: "7px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, color: "#374151" }}
              >
                <option value="">All Statuses</option>
                {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
              <select
                value={filterCat}
                onChange={(e) => setFilterCat(e.target.value)}
                style={{ padding: "7px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, color: "#374151" }}
              >
                <option value="">All Categories</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_ICON[c]} {c}</option>)}
              </select>
            </div>

            {displayTickets.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px 24px", color: "#94a3b8" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎫</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: "#64748b" }}>No tickets found</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  {isManager ? "No tickets have been raised yet." : "You haven't raised any tickets yet."}
                </div>
              </div>
            ) : (
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Ticket #", "Subject", "Category", "Priority", "Status", isManager ? "Raised By" : "Created", "Updated", ""].map((h) => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#64748b", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayTickets.map((t) => (
                      <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "11px 14px", fontSize: 12, fontFamily: "monospace", color: "#6366f1" }}>{t.ticket_no}</td>
                        <td style={{ padding: "11px 14px", fontSize: 13, color: "#1e293b", maxWidth: 240 }}>
                          <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 13, color: "#64748b" }}>{CAT_ICON[t.category]} {t.category}</td>
                        <td style={{ padding: "11px 14px" }}>{priorityBadge(t.priority)}</td>
                        <td style={{ padding: "11px 14px" }}>{statusBadge(t.status)}</td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: "#64748b" }}>
                          {isManager ? t.created_by_name : fmtDate(t.created_at)}
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: "#94a3b8" }}>{timeAgo(t.updated_at)}</td>
                        <td style={{ padding: "11px 14px" }}>
                          <button
                            onClick={() => openTicket(t)}
                            style={{ background: "none", border: "1px solid #e2e8f0", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "#6366f1" }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </HRMSLayout>
  );
}
