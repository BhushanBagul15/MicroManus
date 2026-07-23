/**
 * Static pricing config — USD per 1M tokens.
 * Sourced from provider pricing pages / aggregators as of 2026-07-22. Verify against
 * https://www.anthropic.com/pricing, https://openai.com/api/pricing, https://platform.moonshot.ai
 * before relying on this for real billing; providers change prices without notice.
 *
 * cacheRead: price for tokens served from a prompt cache hit.
 * cacheWrite: price for tokens written into the cache (Anthropic 5-minute TTL rate).
 * Kimi/OpenAI cache writes are billed at the normal input rate (no separate write surcharge
 * documented), so cacheWrite === input for those providers.
 */

export type Provider = "openai" | "anthropic" | "kimi" | "groq" | "gemini";

export interface ModelPricing {
  id: string; // exact model ID to pass to the SDK
  label: string; // human-friendly name for the Settings dropdown
  provider: Provider;
  input: number; // $ / 1M input tokens
  output: number; // $ / 1M output tokens
  cacheRead: number; // $ / 1M cached-read input tokens
  cacheWrite: number; // $ / 1M cache-write input tokens
  contextWindow: number;
}

export const MODEL_PRICING: ModelPricing[] = [
  // --- Anthropic ---
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5 (intro pricing thru Aug 31 2026)",
    provider: "anthropic",
    input: 2.0,
    output: 10.0,
    cacheRead: 0.2,
    cacheWrite: 2.5,
    contextWindow: 1_000_000,
  },
  {
    id: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    provider: "anthropic",
    input: 5.0,
    output: 25.0,
    cacheRead: 0.5,
    cacheWrite: 6.25,
    contextWindow: 1_000_000,
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    input: 1.0,
    output: 5.0,
    cacheRead: 0.1,
    cacheWrite: 1.25,
    contextWindow: 200_000,
  },

  // --- OpenAI ---
  {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    provider: "openai",
    input: 5.0,
    output: 30.0,
    cacheRead: 0.5,
    cacheWrite: 5.0,
    contextWindow: 1_000_000,
  },
  {
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    provider: "openai",
    input: 2.5,
    output: 15.0,
    cacheRead: 0.25,
    cacheWrite: 2.5,
    contextWindow: 1_000_000,
  },

  // --- Kimi (Moonshot, OpenAI-compatible endpoint) ---
  {
    id: "kimi-k2.6",
    label: "Kimi K2.6",
    provider: "kimi",
    input: 0.95,
    output: 4.0,
    cacheRead: 0.15,
    cacheWrite: 0.95,
    contextWindow: 256_000,
  },
  {
    id: "kimi-k2.5",
    label: "Kimi K2.5",
    provider: "kimi",
    input: 0.6,
    output: 3.0,
    cacheRead: 0.1,
    cacheWrite: 0.6,
    contextWindow: 262_144,
  },

  // --- Groq (LPU-hosted open-weight models, OpenAI-compatible endpoint) ---
  {
    id: "llama-3.3-70b-versatile",
    label: "Llama 3.3 70B Versatile (Groq)",
    provider: "groq",
    input: 0.59,
    output: 0.79,
    cacheRead: 0.59, // no documented cache discount on this model
    cacheWrite: 0.59,
    contextWindow: 128_000,
  },
  {
    id: "openai/gpt-oss-120b",
    label: "GPT-OSS 120B (Groq)",
    provider: "groq",
    input: 0.15,
    output: 0.6,
    cacheRead: 0.075, // Groq documents a 50% cache-read discount for GPT-OSS models
    cacheWrite: 0.15,
    contextWindow: 128_000,
  },

  // --- Google Gemini ---
  // Model ID strings are Google's Gemini API naming as of 2026-07-23 — confirm the exact
  // string in Google AI Studio before shipping, Google's preview/GA suffixes shift often.
  {
    id: "gemini-3.1-pro",
    label: "Gemini 3.1 Pro",
    provider: "gemini",
    input: 2.0,
    output: 12.0,
    cacheRead: 0.2,
    cacheWrite: 2.0,
    contextWindow: 1_000_000,
  },
  {
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    provider: "gemini",
    input: 1.5,
    output: 9.0,
    cacheRead: 0.15,
    cacheWrite: 1.5,
    contextWindow: 1_000_000,
  },
];

export function getModelPricing(modelId: string): ModelPricing | undefined {
  return MODEL_PRICING.find((m) => m.id === modelId);
}

export function modelsForProvider(provider: Provider): ModelPricing[] {
  return MODEL_PRICING.filter((m) => m.provider === provider);
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Computes exact cost in USD for a usage event against the static pricing table. */
export function computeCostUsd(modelId: string, usage: TokenUsage): number {
  const pricing = getModelPricing(modelId);
  if (!pricing) {
    throw new Error(`No pricing entry for model "${modelId}" — add it to lib/pricing.ts`);
  }
  const cost =
    (usage.inputTokens / 1_000_000) * pricing.input +
    (usage.outputTokens / 1_000_000) * pricing.output +
    (usage.cacheReadTokens / 1_000_000) * pricing.cacheRead +
    (usage.cacheWriteTokens / 1_000_000) * pricing.cacheWrite;
  return Math.round(cost * 1_000_000) / 1_000_000; // round to 6 decimal places
}
