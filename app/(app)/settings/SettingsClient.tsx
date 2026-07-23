"use client";

import { useState } from "react";
import { MODEL_PRICING, modelsForProvider, type Provider } from "@/lib/pricing";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

interface ExistingKey {
  provider: Provider;
  key_last4: string;
  base_url: string | null;
  default_model: string;
  created_at: string;
}

const PROVIDER_LABELS: Record<Provider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic (Claude)",
  kimi: "Kimi (Moonshot)",
  groq: "Groq",
  gemini: "Google Gemini",
};

export function SettingsClient({ existingKeys }: { existingKeys: ExistingKey[] }) {
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState(modelsForProvider("anthropic")[0]?.id ?? "");
  const [status, setStatus] = useState<"idle" | "validating" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [keys, setKeys] = useState(existingKeys);

  function onProviderChange(p: Provider) {
    setProvider(p);
    setModel(modelsForProvider(p)[0]?.id ?? "");
    setStatus("idle");
  }

  async function save() {
    setStatus("validating");
    setErrorMsg("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, apiKey, baseUrl: baseUrl || null, model }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus("error");
        setErrorMsg(data.error || "Key validation failed");
        return;
      }
      setStatus("saved");
      setApiKey("");
      setKeys((prev) => [
        ...prev.filter((k) => k.provider !== provider),
        { provider, key_last4: data.last4, base_url: baseUrl || null, default_model: model, created_at: new Date().toISOString() },
      ]);
    } catch {
      setStatus("error");
      setErrorMsg("Network error while validating key");
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div>
          <label className="text-sm font-medium block mb-1.5">Provider</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
              <button
                key={p}
                onClick={() => onProviderChange(p)}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${provider === p ? "border-accent bg-accent/10 font-medium" : "border-border hover:bg-muted"
                  }`}
              >
                {PROVIDER_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1.5">Model</label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
          >
            {modelsForProvider(provider).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — ${m.input}/${m.output} per 1M tok
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium block mb-1.5">API key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              provider === "anthropic"
                ? "sk-ant-..."
                : provider === "gemini"
                  ? "AIza..."
                  : "sk-..."
            }
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent font-mono"
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-1.5">
            Base URL <span className="text-muted-foreground font-normal">(optional override)</span>
          </label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={provider === "kimi" ? "https://api.moonshot.cn/v1 (default)" : "leave blank for provider default"}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent font-mono"
          />
        </div>

        <button
          onClick={save}
          disabled={!apiKey || status === "validating"}
          className="flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {status === "validating" && <Loader2 className="h-4 w-4 animate-spin" />}
          {status === "validating" ? "Validating key..." : "Save & validate"}
        </button>

        {status === "saved" && (
          <p className="flex items-center gap-1.5 text-sm text-emerald-600">
            <CheckCircle2 className="h-4 w-4" /> Key validated and saved.
          </p>
        )}
        {status === "error" && (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <XCircle className="h-4 w-4" /> {errorMsg}
          </p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">Configured providers</h2>
        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No keys saved yet. The chat input stays disabled until at least one provider is configured.
          </p>
        ) : (
          <ul className="space-y-2">
            {keys.map((k) => (
              <li
                key={k.provider}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm"
              >
                <div>
                  <div className="font-medium">{PROVIDER_LABELS[k.provider]}</div>
                  <div className="text-muted-foreground font-mono text-xs">{k.key_last4}</div>
                </div>
                <div className="text-muted-foreground text-xs">
                  {MODEL_PRICING.find((m) => m.id === k.default_model)?.label ?? k.default_model}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
