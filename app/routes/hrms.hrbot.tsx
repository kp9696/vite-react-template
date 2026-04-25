import { Fragment, useEffect, useRef, useState } from "react";
import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.hrbot";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";
import { callCoreHrmsApi, signApiToken } from "../lib/core-hrms-api.server";

interface Message {
  role: "user" | "assistant";
  content: string;
  ts: string;
}

const suggestions = [
  "How many leaves do I have left?",
  "What's the WFH policy?",
  "How is my TDS calculated?",
  "How do I apply for maternity leave?",
  "What's the travel reimbursement limit?",
  "When is the next performance review?",
];

const now = () => new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

export function meta() {
  return [{ title: "JWithKP HRMS - HRBot" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);

  const [balances, summary] = await Promise.all([
    callCoreHrmsApi<{ balances?: Array<{ leave_type?: string; remaining?: number }> }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: "/api/leaves/balance",
    }),
    callCoreHrmsApi<{ attendanceSummary?: { present?: number } }>({
      request,
      env: context.cloudflare.env,
      currentUser,
      path: "/api/dashboard/summary",
    }),
  ]);

  const leaveBalanceSummary = (balances?.balances || [])
    .slice(0, 3)
    .map((row) => `${row.leave_type || "Leave"}: ${Number(row.remaining ?? 0)} left`)
    .join(" | ") || "No leave balances available yet.";

  const apiToken = await signApiToken(currentUser, context.cloudflare.env);

  return {
    currentUser,
    apiToken,
    liveContext: {
      leaveBalanceSummary,
      presentCount: Number(summary?.attendanceSummary?.present ?? 0),
    },
  };
}

export default function HRBot() {
  const { currentUser, apiToken, liveContext } = useLoaderData<typeof loader>();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! I'm **HRBot**, your HR assistant. I can help with leave policies, payroll basics, benefits, and performance guidance. What can I help you with today?",
      ts: now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMessage: Message = { role: "user", content: text, ts: now() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    // Add an empty assistant message to stream into
    const assistantTs = now();
    setMessages((current) => [...current, { role: "assistant", content: "", ts: assistantTs }]);

    try {
      const conversationHistory = nextMessages.map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch("/api/hrbot/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiToken}`,
        },
        body: JSON.stringify({ messages: conversationHistory, context: liveContext }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Server error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;
          try {
            const parsed = JSON.parse(raw) as { content?: string };
            if (parsed.content) {
              setMessages((current) => {
                const updated = [...current];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = { ...last, content: last.content + parsed.content };
                }
                return updated;
              });
            }
          } catch {
            // skip malformed chunk
          }
        }
      }
    } catch (err) {
      setMessages((current) => {
        const updated = [...current];
        const last = updated[updated.length - 1];
        if (last?.role === "assistant" && last.content === "") {
          updated[updated.length - 1] = {
            ...last,
            content: "Sorry, I couldn't connect to the AI service right now. Please try again in a moment.",
          };
        }
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  const renderInline = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
      }

      return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
    });
  };

  const renderContent = (text: string) => {
    const lines = text.split("\n");
    const nodes: React.ReactNode[] = [];
    let listItems: string[] = [];

    const flushList = () => {
      if (listItems.length === 0) {
        return;
      }

      nodes.push(
        <ul key={`list-${nodes.length}`} style={{ margin: "6px 0 6px 16px" }}>
          {listItems.map((item, index) => (
            <li key={`${item}-${index}`}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      listItems = [];
    };

    for (const line of lines) {
      if (line.startsWith("- ")) {
        listItems.push(line.slice(2));
        continue;
      }

      flushList();
      if (!line.trim()) {
        nodes.push(<div key={`spacer-${nodes.length}`} style={{ height: 8 }} />);
        continue;
      }

      nodes.push(<div key={`line-${nodes.length}`}>{renderInline(line)}</div>);
    }

    flushList();
    return nodes;
  };

  return (
    <HRMSLayout currentUser={currentUser}>
      <div className="page-title">HRBot - Policy Assistant</div>
      <div className="page-sub">Real AI assistant powered by Gemini 2.0 Flash — ask anything about HR policies, payroll, or leaves.</div>

      <div className="hrbot-grid" style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20, height: "calc(100vh - 220px)" }}>
        <div style={{ display: "flex", flexDirection: "column", background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent)", display: "grid", placeItems: "center", fontSize: 20 }}>AI</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>HRBot</div>
              <div style={{ fontSize: 12, color: "var(--green)", fontWeight: 600 }}>Online · AI-powered · Gemini 2.0 Flash</div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
            {messages.map((message, index) => (
              <div key={index} style={{ display: "flex", flexDirection: message.role === "user" ? "row-reverse" : "row", gap: 10, alignItems: "flex-end" }}>
                {message.role === "assistant" && (
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent)", display: "grid", placeItems: "center", fontSize: 14, flexShrink: 0 }}>AI</div>
                )}
                <div style={{ maxWidth: "75%" }}>
                  <div
                    style={{
                      padding: "12px 16px",
                      borderRadius: message.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      background: message.role === "user" ? "var(--accent)" : "var(--surface)",
                      color: message.role === "user" ? "white" : "var(--ink)",
                      fontSize: 13.5,
                      lineHeight: 1.6,
                    }}
                  >
                    {renderContent(message.content)}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 4, textAlign: message.role === "user" ? "right" : "left" }}>{message.ts}</div>
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent)", display: "grid", placeItems: "center", fontSize: 14 }}>AI</div>
                <div style={{ padding: "12px 16px", borderRadius: "16px 16px 16px 4px", background: "var(--surface)" }}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {[0, 1, 2].map((item) => (
                      <div
                        key={item}
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "var(--ink-3)",
                          animation: "bounce 1.2s infinite",
                          animationDelay: `${item * 0.2}s`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 10 }}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && !event.shiftKey && send(input)}
              placeholder="Ask about leaves, payroll, policies..."
              disabled={loading}
              style={{
                flex: 1,
                padding: "10px 16px",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 13.5,
                outline: "none",
                background: loading ? "var(--surface)" : "white",
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className="btn btn-primary"
              style={{ padding: "10px 20px", opacity: loading || !input.trim() ? 0.6 : 1 }}
            >
              Send
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ margin: 0 }}>
            <div className="card-title">Quick Questions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => send(suggestion)}
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    cursor: "pointer",
                    fontSize: 12,
                    color: "var(--ink-2)",
                    textAlign: "left",
                    fontWeight: 500,
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.background = "var(--accent-light)";
                    event.currentTarget.style.borderColor = "var(--accent)";
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.background = "var(--surface)";
                    event.currentTarget.style.borderColor = "var(--border)";
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          <div className="card" style={{ margin: 0 }}>
            <div className="card-title">Need Human Help?</div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, marginBottom: 16 }}>
              For queries that HRBot can't answer, reach out to your HR team directly via the company directory or internal chat.
            </div>
            <Link to="/hrms/employees" style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 14px", borderRadius: 10,
              background: "var(--accent-light)", color: "var(--accent)",
              textDecoration: "none", fontWeight: 600, fontSize: 13,
              border: "1px solid #c7d2fe",
            }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              View Employee Directory
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
        @media (max-width: 768px) {
          .hrbot-grid {
            grid-template-columns: 1fr !important;
            height: auto !important;
          }
        }
      `}</style>
    </HRMSLayout>
  );
}

