"use client";

import { Search, Globe, FileText, ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";

const TOOL_META: Record<string, { label: string; icon: any }> = {
  web_search: { label: "Searching the web", icon: Search },
  fetch_url: { label: "Reading a page", icon: Globe },
  create_pdf_report: { label: "Generating PDF report", icon: FileText },
};

function summarizeResult(toolName: string, result: any): string {
  if (result == null) return "";
  try {
    if (toolName === "web_search" && Array.isArray(result.results)) {
      return `Found ${result.results.length} result${result.results.length === 1 ? "" : "s"}: ${result.results
        .slice(0, 3)
        .map((r: any) => r.title)
        .join(", ")}${result.results.length > 3 ? ", ..." : ""}`;
    }
    if (toolName === "fetch_url") {
      if (result.error) return `Error: ${result.error}`;
      const len = result.content?.length ?? 0;
      return `Read ~${len.toLocaleString()} characters${result.truncated ? " (truncated)" : ""}`;
    }
    if (toolName === "create_pdf_report") {
      return `Report "${result.title}" generated and uploaded.`;
    }
  } catch {
    // fall through to generic summary
  }
  return typeof result === "string" ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200);
}

function summarizeArgs(toolName: string, args: any): string {
  if (!args) return "";
  if (toolName === "web_search") return `"${args.query}"`;
  if (toolName === "fetch_url") return args.url;
  if (toolName === "create_pdf_report") return `"${args.title}"`;
  return JSON.stringify(args);
}

export function AgentTraceStep({
  toolName,
  args,
  result,
  state,
}: {
  toolName: string;
  args: any;
  result: any;
  state: "partial-call" | "call" | "result" | string;
}) {
  const [open, setOpen] = useState(false);
  const meta = TOOL_META[toolName] ?? { label: toolName, icon: Search };
  const Icon = meta.icon;
  const pending = state !== "result";

  return (
    <div className="trace-step rounded-lg bg-muted/40 pl-3 pr-2 py-2 text-xs">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 text-left"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
        ) : (
          <Icon className="h-3.5 w-3.5 shrink-0 text-accent" />
        )}
        <span className="font-medium">{meta.label}</span>
        <span className="text-muted-foreground truncate flex-1">{summarizeArgs(toolName, args)}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {!pending && (
        <p className="text-muted-foreground mt-1 pl-5.5 leading-relaxed">
          {summarizeResult(toolName, result)}
        </p>
      )}

      {open && (
        <div className="mt-2 pl-5.5 space-y-2">
          <div>
            <div className="text-muted-foreground font-medium mb-0.5">Arguments</div>
            <pre className="rounded-md bg-background border border-border p-2 overflow-x-auto whitespace-pre-wrap break-words">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>
          {!pending && (
            <div>
              <div className="text-muted-foreground font-medium mb-0.5">Result</div>
              <pre className="rounded-md bg-background border border-border p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
