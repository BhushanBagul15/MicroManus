"use client";

import { useChat, type Message } from "ai/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MODEL_PRICING, type Provider } from "@/lib/pricing";
import { AgentTraceStep } from "@/components/AgentTraceStep";
import { PdfCard } from "@/components/PdfCard";
import { Send, Loader2, AlertTriangle } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface PersistedMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  tool_calls_json: any[] | null;
  created_at: string;
}

interface ReportRow {
  id: string;
  message_id: string | null;
  title: string;
  storage_url: string;
}

interface KeyRow {
  provider: Provider;
  default_model: string;
}

function toInitialMessages(rows: PersistedMessage[]): Message[] {
  return rows
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map((r) => ({
      id: r.id,
      role: r.role as "user" | "assistant",
      content: r.content,
      // Replayed tool trace is shown via the `parts` fallback rendering below
      // rather than reconstructed AI SDK tool-invocation parts, since the exact
      // part shape is an internal SDK format we don't want to hand-fake.
    }));
}

function parseErrorMessage(msg: string) {
  try {
    const parsed = JSON.parse(msg);
    if (parsed.error?.message) return parsed.error.message;
    if (parsed.message) return parsed.message;
    if (typeof parsed.error === "string") return parsed.error;
  } catch (e) {
    // not JSON
  }
  if (msg.startsWith("Error: ")) return msg.replace("Error: ", "");
  return msg;
}

export function ChatClient({
  threadId,
  threadTitle,
  initialMessages,
  reports,
  availableKeys,
}: {
  threadId: string;
  threadTitle: string;
  initialMessages: PersistedMessage[];
  reports: ReportRow[];
  availableKeys: KeyRow[];
}) {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider | null>(availableKeys[0]?.provider ?? null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error, reload } = useChat({
    api: "/api/chat",
    id: threadId,
    initialMessages: toInitialMessages(initialMessages),
    body: { threadId, provider },
  });

  let parsedErrorMsg = "";
  let isTokenLimit = false;
  let isRateLimit = false;
  let isNetworkError = false;

  if (error) {
    parsedErrorMsg = parseErrorMessage(error.message);
    const lower = parsedErrorMsg.toLowerCase();
    isTokenLimit = lower.includes("token limit") || lower.includes("context length") || lower.includes("too many tokens") || lower.includes("maximum context length");
    isRateLimit = lower.includes("rate limit") || lower.includes("429") || lower.includes("too many requests");
    isNetworkError = lower === "network error" || lower.includes("failed to fetch");
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const hasKey = availableKeys.length > 0;
  const modelLabel = useMemo(
    () => MODEL_PRICING.find((m) => m.provider === provider)?.label,
    [provider]
  );

  // Map old, already-persisted tool_calls_json onto history rows for replay display.
  const historyTrace = new Map<string, any[]>();
  for (const row of initialMessages) {
    if (row.tool_calls_json) historyTrace.set(row.id, row.tool_calls_json);
  }
  const reportsByMessage = new Map<string, ReportRow[]>();
  for (const r of reports) {
    if (!r.message_id) continue;
    reportsByMessage.set(r.message_id, [...(reportsByMessage.get(r.message_id) ?? []), r]);
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <h1 className="font-medium truncate">{threadTitle}</h1>
        {availableKeys.length > 1 && (
          <select
            value={provider ?? ""}
            onChange={(e) => setProvider(e.target.value as Provider)}
            className="text-xs rounded-md border border-border bg-card px-2 py-1"
          >
            {availableKeys.map((k) => (
              <option key={k.provider} value={k.provider}>
                {k.provider} — {MODEL_PRICING.find((m) => m.id === k.default_model)?.label}
              </option>
            ))}
          </select>
        )}
        {availableKeys.length === 1 && (
          <span className="text-xs text-muted-foreground">{modelLabel}</span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {messages.map((m) => (
          <div key={m.id} className="space-y-3">
            {m.role === "user" ? (
              <div className="flex justify-end">
                <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2.5 text-sm">
                  {m.content}
                </div>
              </div>
            ) : (
              <div className="max-w-[85%] space-y-3">
                {/* Live agent trace for the current streaming turn, via AI SDK message parts */}
                {m.parts?.map((part, i) => {
                  if (part.type === "tool-invocation") {
                    return (
                      <AgentTraceStep
                        key={i}
                        toolName={part.toolInvocation.toolName}
                        args={part.toolInvocation.args}
                        result={"result" in part.toolInvocation ? part.toolInvocation.result : undefined}
                        state={part.toolInvocation.state}
                      />
                    );
                  }
                  if (part.type === "text" && part.text) {
                    return (
                      <div key={i} className="prose prose-sm max-w-none dark:prose-invert">
                        <ReactMarkdown>{part.text}</ReactMarkdown>
                      </div>
                    );
                  }
                  return null;
                })}

                {/* Fallback for replayed history rows that don't carry `parts` */}
                {!m.parts && historyTrace.get(m.id)?.map((tc, i) => (
                  <AgentTraceStep
                    key={i}
                    toolName={tc.toolName}
                    args={tc.args}
                    result={tc.result}
                    state="result"
                  />
                ))}
                {!m.parts && m.content && (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                )}

                {reportsByMessage.get(m.id)?.map((r) => (
                  <PdfCard key={r.id} title={r.title} url={r.storage_url} />
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> thinking...
          </div>
        )}
        {error && (
          <div className="flex flex-col gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive max-w-[85%]">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" />
              <span>Something went wrong</span>
            </div>
            <div className="opacity-90 leading-relaxed">
              {isTokenLimit ? (
                <p>This conversation has reached the model's maximum memory limit. Please start a new chat to continue.</p>
              ) : isRateLimit ? (
                <p>You've hit the AI provider's rate limit. Please wait a moment and try again.</p>
              ) : isNetworkError ? (
                <p>Network error. The connection was lost, which often happens when the AI provider's strict rate limits are exceeded or their server crashes. Please wait a moment and try again.</p>
              ) : (
                <p>{parsedErrorMsg}</p>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2">
              {isTokenLimit ? (
                <button
                  type="button"
                  onClick={() => router.push("/chat")}
                  className="px-3 py-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors rounded-md text-xs font-medium"
                >
                  Start New Chat
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => reload()}
                  className="px-3 py-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors rounded-md text-xs font-medium"
                >
                  Retry Message
                </button>
              )}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border p-4">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <textarea
            value={input}
            onChange={handleInputChange}
            disabled={!hasKey || isLoading}
            rows={2}
            placeholder={
              hasKey
                ? "Ask MicroManus to research something..."
                : "Add your API key in Settings to start chatting"
            }
            className="flex-1 resize-none rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                (e.currentTarget.closest("form") as HTMLFormElement)?.requestSubmit();
              }
            }}
          />
          <button
            type="submit"
            disabled={!hasKey || isLoading || !input.trim()}
            className="rounded-xl bg-primary text-primary-foreground p-3 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
