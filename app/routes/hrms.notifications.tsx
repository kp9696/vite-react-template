import { useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi } from "../lib/core-hrms-api.server";
import { isAdminRole } from "../lib/hrms.shared";
import type { Route } from "./+types/hrms.notifications";

// ── Types ─────────────────────────────────────────────────────────────────────

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  link: string | null;
  created_at: string;
}

interface WebhookRow {
  id: string;
  provider: string;
  webhook_url: string;
  is_active: number;
  created_at: string;
}

interface LoaderData {
  notifications: NotificationRow[];
  unreadCount: number;
  webhooks: WebhookRow[];
  isAdmin: boolean;
}

// ── Loader ────────────────────────────────────────────────────────────────────

export async function loader({ request, context }: Route.LoaderArgs): Promise<LoaderData> {
  const env = context.cloudflare.env;
  const currentUser = await requireSignedInUser(request, env);
  const admin = isAdminRole(currentUser.role);

  const [notifData, webhookData] = await Promise.all([
    callCoreHrmsApi<{ notifications: NotificationRow[]; unreadCount: number }>({
      request, env, currentUser,
      path: "/api/notifications",
    }),
    admin
      ? callCoreHrmsApi<{ webhooks: WebhookRow[] }>({
          request, env, currentUser,
          path: "/api/notifications/webhooks",
        })
      : Promise.resolve(null),
  ]);

  return {
    notifications: notifData?.notifications ?? [],
    unreadCount: notifData?.unreadCount ?? 0,
    webhooks: webhookData?.webhooks ?? [],
    isAdmin: admin,
  };
}

// ── Action ────────────────────────────────────────────────────────────────────

export async function action({ request, context }: Route.ActionArgs) {
  const env = context.cloudflare.env;
  const currentUser = await requireSignedInUser(request, env);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "mark-all-read") {
    await callCoreHrmsApi({
      request, env, currentUser,
      path: "/api/notifications/read-all",
      method: "PATCH",
    });
    return { ok: true, intent };
  }

  if (intent === "mark-one-read") {
    const id = formData.get("id") as string;
    if (id) {
      await callCoreHrmsApi({
        request, env, currentUser,
        path: `/api/notifications/${id}/read`,
        method: "PATCH",
      });
    }
    return { ok: true, intent };
  }

  if (intent === "add-webhook") {
    const provider = (formData.get("provider") as string)?.trim();
    const webhookUrl = (formData.get("webhookUrl") as string)?.trim();
    const result = await callCoreHrmsApi<{ ok?: boolean; error?: string }>({
      request, env, currentUser,
      path: "/api/notifications/webhooks",
      method: "POST",
      body: { provider, webhookUrl },
    });
    return { ok: result?.ok ?? false, intent, error: result?.error };
  }

  if (intent === "test-webhook") {
    const webhookId = formData.get("webhookId") as string;
    const result = await callCoreHrmsApi<{ ok?: boolean; error?: string }>({
      request, env, currentUser,
      path: "/api/notifications/webhooks/test",
      method: "POST",
      body: { webhookId, message: "HRMS test notification 🎉" },
    });
    return { ok: result?.ok ?? false, intent, error: result?.error };
  }

  return { ok: false, intent: "unknown" };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { icon: string; color: string; label: string; filterKey: string }> = {
  leave_approved:         { icon: "📅", color: "#10b981", label: "Leave",    filterKey: "leave" },
  leave_rejected:         { icon: "📅", color: "#ef4444", label: "Leave",    filterKey: "leave" },
  leave_request:          { icon: "📅", color: "#3b82f6", label: "Leave",    filterKey: "leave" },
  expense_approved:       { icon: "🧾", color: "#10b981", label: "Expense",  filterKey: "expense" },
  expense_rejected:       { icon: "🧾", color: "#ef4444", label: "Expense",  filterKey: "expense" },
  expense_reimbursed:     { icon: "💵", color: "#10b981", label: "Expense",  filterKey: "expense" },
  helpdesk_status_change: { icon: "🎫", color: "#8b5cf6", label: "Helpdesk", filterKey: "helpdesk" },
  helpdesk_comment:       { icon: "💬", color: "#8b5cf6", label: "Helpdesk", filterKey: "helpdesk" },
  resignation_approved:   { icon: "🚪", color: "#10b981", label: "Exit",     filterKey: "exit" },
  resignation_rejected:   { icon: "🚪", color: "#ef4444", label: "Exit",     filterKey: "exit" },
  wfh_request:            { icon: "🏠", color: "#f59e0b", label: "WFH",      filterKey: "leave" },
  wfh_decision:           { icon: "🏠", color: "#3b82f6", label: "WFH",      filterKey: "leave" },
  loan_request:           { icon: "💰", color: "#f59e0b", label: "Loans",    filterKey: "loan" },
  loan_decision:          { icon: "💰", color: "#3b82f6", label: "Loans",    filterKey: "loan" },
  loan_closed:            { icon: "🎉", color: "#10b981", label: "Loans",    filterKey: "loan" },
  fnf_approved:           { icon: "🤝", color: "#10b981", label: "F&F",      filterKey: "exit" },
  fnf_disbursed:          { icon: "💸", color: "#10b981", label: "F&F",      filterKey: "exit" },
  announcement:           { icon: "📣", color: "#0ea5e9", label: "Notice",   filterKey: "announcement" },
};

function getTypeMeta(type: string) {
  return TYPE_META[type] ?? { icon: "🔔", color: "#6b7280", label: "System", filterKey: "other" };
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function groupByDate(items: NotificationRow[]): { label: string; items: NotificationRow[] }[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: Record<string, NotificationRow[]> = {
    Today: [],
    Yesterday: [],
    "This week": [],
    Earlier: [],
  };

  for (const n of items) {
    const d = new Date(n.created_at); d.setHours(0, 0, 0, 0);
    if (d >= today) groups["Today"].push(n);
    else if (d >= yesterday) groups["Yesterday"].push(n);
    else if (d >= weekAgo) groups["This week"].push(n);
    else groups["Earlier"].push(n);
  }

  return Object.entries(groups)
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => ({ label, items: list }));
}

const FILTERS = [
  { key: "all",          label: "All" },
  { key: "unread",       label: "Unread" },
  { key: "leave",        label: "Leave & WFH" },
  { key: "expense",      label: "Expenses" },
  { key: "loan",         label: "Loans" },
  { key: "helpdesk",     label: "Help Desk" },
  { key: "exit",         label: "Exit & F&F" },
  { key: "announcement", label: "Notices" },
];

// ── Webhook panel (admin only) ────────────────────────────────────────────────

function WebhookPanel({ webhooks }: { webhooks: WebhookRow[] }) {
  const fetcher = useFetcher<{ ok: boolean; intent: string; error?: string }>();
  const [showForm, setShowForm] = useState(false);
  const [provider, setProvider] = useState("Slack");
  const [url, setUrl] = useState("");

  const submitting = fetcher.state !== "idle";
  const lastIntent = fetcher.data?.intent;
  const lastOk = fetcher.data?.ok;
  const testFeedback: Record<string, "ok" | "fail"> = {};
  if (lastIntent === "test-webhook") {
    // store is ephemeral — shown inline via fetcher.data
  }

  function submitAdd() {
    if (!url.trim()) return;
    const fd = new FormData();
    fd.set("intent", "add-webhook");
    fd.set("provider", provider);
    fd.set("webhookUrl", url);
    fetcher.submit(fd, { method: "POST" });
    setUrl("");
    setShowForm(false);
  }

  function testWebhook(id: string) {
    const fd = new FormData();
    fd.set("intent", "test-webhook");
    fd.set("webhookId", id);
    fetcher.submit(fd, { method: "POST" });
  }

  const PROVIDER_OPTIONS = ["Slack", "Microsoft Teams", "Discord", "Google Chat", "Custom"];

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", marginTop: 24 }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>🔗 Webhook Integrations</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>Send notifications to Slack, Teams, or any HTTP endpoint</div>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          style={{ background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          + Add Webhook
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{ padding: "16px 20px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>PROVIDER</label>
              <select
                value={provider}
                onChange={e => setProvider(e.target.value)}
                style={{ border: "1px solid #d1d5db", borderRadius: 7, padding: "7px 10px", fontSize: 13, background: "#fff", color: "#111827" }}
              >
                {PROVIDER_OPTIONS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 260 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 }}>WEBHOOK URL</label>
              <input
                type="url"
                placeholder="https://hooks.slack.com/services/..."
                value={url}
                onChange={e => setUrl(e.target.value)}
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 7, padding: "7px 10px", fontSize: 13, boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={submitAdd}
                disabled={!url.trim() || submitting}
                style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: 7, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: url.trim() ? "pointer" : "not-allowed", opacity: url.trim() ? 1 : 0.5 }}
              >
                Save
              </button>
              <button
                onClick={() => setShowForm(false)}
                style={{ background: "#f3f4f6", color: "#374151", border: "1px solid #e5e7eb", borderRadius: 7, padding: "7px 14px", fontSize: 13, cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
          {fetcher.data?.intent === "add-webhook" && !fetcher.data.ok && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#ef4444" }}>
              ⚠️ {fetcher.data.error ?? "Failed to save webhook."}
            </div>
          )}
        </div>
      )}

      {/* List */}
      {webhooks.length === 0 && !showForm ? (
        <div style={{ padding: "32px 20px", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
          No webhooks configured yet. Add one to forward notifications to Slack or Teams.
        </div>
      ) : (
        <div>
          {webhooks.map(wh => (
            <div key={wh.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "#f0f9ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                {wh.provider.toLowerCase().includes("slack") ? "💬"
                  : wh.provider.toLowerCase().includes("team") ? "🟦"
                  : wh.provider.toLowerCase().includes("discord") ? "🎮"
                  : "🔗"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{wh.provider}</div>
                <div style={{ fontSize: 11, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>{wh.webhook_url}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: wh.is_active ? "#d1fae5" : "#f3f4f6", color: wh.is_active ? "#065f46" : "#6b7280" }}>
                  {wh.is_active ? "Active" : "Inactive"}
                </span>
                <button
                  onClick={() => testWebhook(wh.id)}
                  disabled={submitting}
                  style={{ fontSize: 12, color: "#4f46e5", background: "#ede9fe", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontWeight: 600 }}
                >
                  Test
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Test feedback */}
      {fetcher.data?.intent === "test-webhook" && (
        <div style={{ padding: "10px 20px", background: fetcher.data.ok ? "#d1fae5" : "#fef2f2", fontSize: 13, color: fetcher.data.ok ? "#065f46" : "#991b1b", borderTop: "1px solid #e5e7eb" }}>
          {fetcher.data.ok ? "✅ Test notification sent successfully!" : `❌ Test failed: ${fetcher.data.error ?? "Unknown error"}`}
        </div>
      )}
    </div>
  );
}

// ── Notification item ─────────────────────────────────────────────────────────

function NotifItem({
  notif,
  onMarkRead,
}: {
  notif: NotificationRow;
  onMarkRead: (id: string, link: string | null) => void;
}) {
  const meta = getTypeMeta(notif.type);

  return (
    <div
      onClick={() => onMarkRead(notif.id, notif.link)}
      style={{
        display: "flex",
        gap: 14,
        padding: "14px 20px",
        cursor: notif.link ? "pointer" : "default",
        background: notif.read ? "#fff" : "#f5f3ff",
        borderBottom: "1px solid #f3f4f6",
        transition: "background 0.15s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = notif.read ? "#f9fafb" : "#ede9fe"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = notif.read ? "#fff" : "#f5f3ff"; }}
    >
      {/* Icon */}
      <div style={{ width: 40, height: 40, borderRadius: 10, background: meta.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0, marginTop: 2 }}>
        {meta.icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontWeight: notif.read ? 500 : 700, fontSize: 14, color: "#111827", lineHeight: 1.3 }}>
            {notif.title}
          </div>
          <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>{relativeTime(notif.created_at)}</span>
            {!notif.read && (
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4f46e5", display: "inline-block", flexShrink: 0 }} />
            )}
          </div>
        </div>
        {notif.body && (
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 3, lineHeight: 1.4 }}>{notif.body}</div>
        )}
        <div style={{ marginTop: 5, display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 99, background: meta.color + "18", color: meta.color }}>
            {meta.label}
          </span>
          {notif.link && (
            <span style={{ fontSize: 11, color: "#4f46e5" }}>View →</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Default export ────────────────────────────────────────────────────────────

export default function Notifications({ loaderData }: Route.ComponentProps) {
  const { notifications, unreadCount, webhooks, isAdmin } = loaderData as LoaderData;
  const fetcher = useFetcher<{ ok: boolean; intent: string }>();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");

  // Optimistic read state — track IDs marked read this session
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const allReadOptimistic = fetcher.state !== "idle" && fetcher.formData?.get("intent") === "mark-all-read";

  function markRead(id: string, link: string | null) {
    if (!readIds.has(id)) {
      setReadIds(prev => new Set([...prev, id]));
      const fd = new FormData();
      fd.set("intent", "mark-one-read");
      fd.set("id", id);
      fetcher.submit(fd, { method: "POST" });
    }
    if (link) navigate(link);
  }

  function markAllRead() {
    const fd = new FormData();
    fd.set("intent", "mark-all-read");
    fetcher.submit(fd, { method: "POST" });
  }

  // Apply optimistic reads
  const displayNotifs: NotificationRow[] = notifications.map(n => ({
    ...n,
    read: n.read || readIds.has(n.id) || allReadOptimistic,
  }));

  // Filter
  const filtered = displayNotifs.filter(n => {
    if (filter === "all") return true;
    if (filter === "unread") return !n.read;
    return getTypeMeta(n.type).filterKey === filter;
  });

  const currentUnread = displayNotifs.filter(n => !n.read).length;
  const grouped = groupByDate(filtered);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}>

      {/* ── Page header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#111827", display: "flex", alignItems: "center", gap: 10 }}>
            🔔 Notifications
            {currentUnread > 0 && (
              <span style={{ fontSize: 13, fontWeight: 700, background: "#4f46e5", color: "#fff", borderRadius: 99, padding: "2px 10px" }}>
                {currentUnread}
              </span>
            )}
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6b7280" }}>
            {notifications.length} total · {currentUnread} unread
          </p>
        </div>
        {currentUnread > 0 && (
          <button
            onClick={markAllRead}
            disabled={fetcher.state !== "idle"}
            style={{
              background: "#fff", border: "1px solid #d1d5db", borderRadius: 8,
              padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#374151",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
            }}
          >
            ✓ Mark all as read
          </button>
        )}
      </div>

      {/* ── Stats strip ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Total", value: notifications.length, bg: "#f9fafb", color: "#374151" },
          { label: "Unread", value: currentUnread, bg: "#f5f3ff", color: "#4f46e5" },
          { label: "Today", value: displayNotifs.filter(n => new Date(n.created_at) >= new Date(new Date().setHours(0,0,0,0))).length, bg: "#f0fdf4", color: "#16a34a" },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: "10px 18px", minWidth: 90, textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filter tabs ── */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {FILTERS.map(f => {
          const count = f.key === "all"
            ? notifications.length
            : f.key === "unread"
            ? currentUnread
            : displayNotifs.filter(n => getTypeMeta(n.type).filterKey === f.key).length;

          if (count === 0 && f.key !== "all") return null;

          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                border: "none", borderRadius: 99, padding: "6px 14px", fontSize: 13, fontWeight: 600,
                cursor: "pointer", transition: "all 0.15s",
                background: filter === f.key ? "#4f46e5" : "#f3f4f6",
                color: filter === f.key ? "#fff" : "#374151",
              }}
            >
              {f.label}
              {count > 0 && (
                <span style={{ marginLeft: 6, fontSize: 11, background: filter === f.key ? "rgba(255,255,255,0.25)" : "#e5e7eb", borderRadius: 99, padding: "1px 6px" }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Notification list ── */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "64px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔕</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#374151", marginBottom: 6 }}>
              {filter === "unread" ? "All caught up!" : "No notifications here"}
            </div>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>
              {filter === "unread"
                ? "You have no unread notifications."
                : "Nothing in this category yet."}
            </div>
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.label}>
              {/* Date group header */}
              <div style={{ padding: "8px 20px", background: "#f9fafb", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {group.label}
                </span>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>· {group.items.length}</span>
              </div>
              {group.items.map(n => (
                <NotifItem key={n.id} notif={n} onMarkRead={markRead} />
              ))}
            </div>
          ))
        )}
      </div>

      {/* ── Admin: Webhook integrations ── */}
      {isAdmin && <WebhookPanel webhooks={webhooks} />}

    </div>
  );
}
