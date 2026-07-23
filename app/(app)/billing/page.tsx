import { createClient } from "@/lib/supabase/server";
import { formatUsd } from "@/lib/utils";

interface UsageRow {
  thread_id: string;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
}

export default async function BillingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: threads } = await supabase
    .from("chat_threads")
    .select("id, title, created_at")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  // Pull every usage_event for this user's threads directly — this table IS the
  // source of truth for /billing; there is no separately-tracked shadow total.
  const threadIds = (threads ?? []).map((t) => t.id);
  const { data: usageRows } = threadIds.length
    ? await supabase.from("usage_events").select("*").in("thread_id", threadIds)
    : { data: [] as UsageRow[] };

  const byThread = new Map<string, UsageRow[]>();
  for (const row of usageRows ?? []) {
    byThread.set(row.thread_id, [...(byThread.get(row.thread_id) ?? []), row as UsageRow]);
  }

  const threadSummaries = (threads ?? []).map((t) => {
    const rows = byThread.get(t.id) ?? [];
    const models = Array.from(new Set(rows.map((r) => r.model)));
    const totals = rows.reduce(
      (acc, r) => ({
        input: acc.input + r.input_tokens,
        output: acc.output + r.output_tokens,
        cacheRead: acc.cacheRead + r.cache_read_tokens,
        cacheWrite: acc.cacheWrite + r.cache_write_tokens,
        cost: acc.cost + Number(r.cost_usd),
      }),
      { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 }
    );
    return { thread: t, models, totals };
  });

  const grandTotal = threadSummaries.reduce(
    (acc, s) => ({
      input: acc.input + s.totals.input,
      output: acc.output + s.totals.output,
      cacheRead: acc.cacheRead + s.totals.cacheRead,
      cacheWrite: acc.cacheWrite + s.totals.cacheWrite,
      cost: acc.cost + s.totals.cost,
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 }
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-1">Billing</h1>
        <p className="text-muted-foreground text-sm mb-8">
          Your own LLM API spend, reconciled directly from logged usage events per thread. This
          is separate from your app chat credits.
        </p>

        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Thread</th>
                <th className="text-left px-4 py-3 font-medium">Model(s)</th>
                <th className="text-right px-4 py-3 font-medium">Input</th>
                <th className="text-right px-4 py-3 font-medium">Output</th>
                <th className="text-right px-4 py-3 font-medium">Cache read</th>
                <th className="text-right px-4 py-3 font-medium">Cache write</th>
                <th className="text-right px-4 py-3 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {threadSummaries.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    No usage yet. Start a chat to see cost tracking here.
                  </td>
                </tr>
              )}
              {threadSummaries.map((s) => (
                <tr key={s.thread.id}>
                  <td className="px-4 py-3 truncate max-w-[200px]">{s.thread.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {s.models.length ? s.models.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.totals.input.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.totals.output.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.totals.cacheRead.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.totals.cacheWrite.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{formatUsd(s.totals.cost)}</td>
                </tr>
              ))}
            </tbody>
            {threadSummaries.length > 0 && (
              <tfoot>
                <tr className="bg-muted/50 font-semibold">
                  <td className="px-4 py-3" colSpan={2}>
                    Grand total
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{grandTotal.input.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{grandTotal.output.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{grandTotal.cacheRead.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{grandTotal.cacheWrite.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatUsd(grandTotal.cost)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
