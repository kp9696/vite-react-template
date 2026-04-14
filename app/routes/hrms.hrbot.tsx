import { Fragment, useEffect, useRef, useState } from "react";
import { useLoaderData } from "react-router";
import type { Route } from "./+types/hrms.hrbot";
import HRMSLayout from "../components/HRMSLayout";
import { requireSignedInUser } from "../lib/jwt-auth.server";

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

function getBotReply(text: string): string {
  const message = text.toLowerCase();

  if (message.includes("leave")) {
    return `Here is the leave policy summary:

- Annual Leave: 18 days
- Sick Leave: 12 days
- Casual Leave: 6 days
- Leave year: April to March

For your exact remaining balance, connect this page to your employee leave data in D1 or confirm with HR.`;
  }

  if (message.includes("wfh") || message.includes("work from home")) {
    return `The current WFH policy is:

- Up to 3 work-from-home days per week for eligible roles
- Manager approval may still be required
- Team-specific exceptions can apply

If your role is client-facing or location-bound, check with your reporting manager.`;
  }

  if (message.includes("tds") || message.includes("tax") || message.includes("payroll")) {
    return `For payroll and tax queries:

- TDS depends on taxable income, declared investments, and salary structure
- PF is 12% of basic salary, with employer contribution matched
- ESI applies when monthly CTC is at or below INR 21,000

For your personal numbers, the payroll team should confirm the latest computation.`;
  }

  if (message.includes("travel") || message.includes("reimbursement") || message.includes("expense")) {
    return `Travel reimbursement guidance:

- Flights: reimbursed on actuals
- Hotels in metro cities: up to INR 2,000 per day
- Meal allowance: INR 500 per day on approved travel

Please keep bills and submit claims within the company expense window.`;
  }

  if (message.includes("performance") || message.includes("okr") || message.includes("review")) {
    return `Performance guidance:

- Reviews normally follow the company review cycle
- OKRs should be updated regularly with your manager
- Keep evidence of outcomes, feedback, and impact for review discussions

Ask HR for the exact review window for your business unit if needed.`;
  }

  if (message.includes("maternity") || message.includes("benefit") || message.includes("insurance")) {
    return `Benefits questions usually need policy-specific confirmation.

- Maternity, insurance, and special leave policies often have eligibility rules
- The safest next step is to contact your HR admin for the current policy document

I can still help summarize the request before you send it.`;
  }

  return `I can help with:

- Leave policies
- Payroll and TDS basics
- WFH policy
- Travel reimbursement
- Performance review guidance

If your question needs company-specific records, contact HR or connect this module to live policy data in D1.`;
}

export function meta() {
  return [{ title: "JWithKP HRMS - HRBot" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const currentUser = await requireSignedInUser(request, context.cloudflare.env);
  return { currentUser };
}

export default function HRBot() {
  const { currentUser } = useLoaderData<typeof loader>();
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
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setLoading(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: getBotReply(text),
          ts: now(),
        },
      ]);
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
      <div className="page-sub">A deploy-safe built-in assistant for common HR policy questions.</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20, height: "calc(100vh - 220px)" }}>
        <div style={{ display: "flex", flexDirection: "column", background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent)", display: "grid", placeItems: "center", fontSize: 20 }}>AI</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>HRBot</div>
              <div style={{ fontSize: 12, color: "var(--green)", fontWeight: 600 }}>Online · Built-in policy helper</div>
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
            <div className="card-title">HR Contacts</div>
            {[
              { name: "Sneha Pillai", role: "HR Generalist", email: "sneha@techcorp.in" },
              { name: "HR Helpdesk", role: "General Queries", email: "hr@techcorp.in" },
              { name: "Payroll Team", role: "Payroll and Tax", email: "payroll@techcorp.in" },
            ].map((contact) => (
              <div key={contact.email} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{contact.name}</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{contact.role}</div>
                <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 2 }}>{contact.email}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>
    </HRMSLayout>
  );
}

