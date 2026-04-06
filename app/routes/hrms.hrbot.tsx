import HRMSLayout from "../components/HRMSLayout";
import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  ts: string;
}

const SYSTEM_PROMPT = `You are HRBot, an intelligent HR assistant for PeopleOS — an enterprise HRMS platform. You help employees and HR teams with:

- Leave policies, balances, and application procedures
- Payroll queries (salary breakdown, tax deductions, payslips)
- Company policies (WFH, travel, expense reimbursement limits)
- Onboarding and offboarding processes
- Performance review cycles and OKR tracking
- Benefits, insurance, and perks
- Recruitment and referral programs
- Compliance and statutory requirements (PF, ESI, TDS — India-focused)
- General HR queries

Keep responses concise, friendly, and professional. Use bullet points for lists. If you don't know something specific to this company, suggest the employee contact HR directly. Always be empathetic and helpful.

Company context:
- Company: TechCorp India Pvt. Ltd.
- HQ: Bengaluru | Offices: Mumbai, Delhi, Hyderabad, Pune
- HR Policy Version: 2026 v1
- Leave year: April to March
- Annual Leave: 18 days | Sick Leave: 12 days | Casual Leave: 6 days
- WFH Policy: Up to 3 days/week for eligible roles
- Travel reimbursement: Actuals for flights, ₹2,000/day cap for hotels (metro cities)
- Meal allowance: ₹500/day on travel
- PF: 12% of basic salary (employer matches)
- ESI: Applicable for CTC ≤ ₹21,000/month`;

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
  return [{ title: "PeopleOS · HRBot" }];
}

export default function HRBot() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! I'm **HRBot** 👋, your AI-powered HR assistant.\n\nI can help you with leave policies, payroll queries, company benefits, performance reviews, and much more. What can I help you with today?",
      ts: now(),
    }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text, ts: now() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: next.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text ?? "Sorry, I couldn't process that. Please try again.";
      setMessages(prev => [...prev, { role: "assistant", content: reply, ts: now() }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "I'm having trouble connecting. Please try again in a moment.", ts: now() }]);
    } finally {
      setLoading(false);
    }
  };

  const renderContent = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/^- (.+)/gm, "<li>$1</li>")
      .replace(/(<li>.*<\/li>)/gs, "<ul style='margin:6px 0 6px 16px'>$1</ul>")
      .replace(/\n/g, "<br/>");
  };

  return (
    <HRMSLayout>
      <div className="page-title">HRBot — AI Assistant</div>
      <div className="page-sub">Ask anything about HR policies, payroll, leaves, and more.</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20, height: "calc(100vh - 220px)" }}>
        {/* Chat window */}
        <div style={{ display: "flex", flexDirection: "column", background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
          {/* Header */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent)", display: "grid", placeItems: "center", fontSize: 20 }}>🤖</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>HRBot</div>
              <div style={{ fontSize: 12, color: "var(--green)", fontWeight: 600 }}>● Online · Powered by Claude AI</div>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", flexDirection: m.role === "user" ? "row-reverse" : "row", gap: 10, alignItems: "flex-end" }}>
                {m.role === "assistant" && (
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent)", display: "grid", placeItems: "center", fontSize: 16, flexShrink: 0 }}>🤖</div>
                )}
                <div style={{ maxWidth: "75%" }}>
                  <div style={{
                    padding: "12px 16px",
                    borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                    background: m.role === "user" ? "var(--accent)" : "var(--surface)",
                    color: m.role === "user" ? "white" : "var(--ink)",
                    fontSize: 13.5, lineHeight: 1.6,
                  }}
                    dangerouslySetInnerHTML={{ __html: renderContent(m.content) }}
                  />
                  <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 4, textAlign: m.role === "user" ? "right" : "left" }}>{m.ts}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent)", display: "grid", placeItems: "center", fontSize: 16 }}>🤖</div>
                <div style={{ padding: "12px 16px", borderRadius: "16px 16px 16px 4px", background: "var(--surface)" }}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{
                        width: 8, height: 8, borderRadius: "50%", background: "var(--ink-3)",
                        animation: "bounce 1.2s infinite", animationDelay: `${i * 0.2}s`
                      }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)", display: "flex", gap: 10 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send(input)}
              placeholder="Ask about leaves, payroll, policies..."
              disabled={loading}
              style={{
                flex: 1, padding: "10px 16px", border: "1px solid var(--border)",
                borderRadius: 10, fontSize: 13.5, outline: "none",
                background: loading ? "var(--surface)" : "white"
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={loading || !input.trim()}
              className="btn btn-primary"
              style={{ padding: "10px 20px", opacity: loading || !input.trim() ? 0.6 : 1 }}
            >
              Send ↑
            </button>
          </div>
        </div>

        {/* Sidebar: suggestions + info */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card" style={{ margin: 0 }}>
            <div className="card-title">Quick Questions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  style={{
                    background: "var(--surface)", border: "1px solid var(--border)",
                    borderRadius: 8, padding: "8px 12px", cursor: "pointer",
                    fontSize: 12, color: "var(--ink-2)", textAlign: "left",
                    fontWeight: 500, transition: "all 0.15s",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--accent-light)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "var(--surface)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="card" style={{ margin: 0 }}>
            <div className="card-title">HR Contacts</div>
            {[
              { name: "Sneha Pillai", role: "HR Generalist", email: "sneha@techcorp.in" },
              { name: "HR Helpdesk", role: "General Queries", email: "hr@techcorp.in" },
              { name: "Payroll Team", role: "Payroll & Tax", email: "payroll@techcorp.in" },
            ].map(c => (
              <div key={c.email} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{c.role}</div>
                <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 2 }}>{c.email}</div>
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
