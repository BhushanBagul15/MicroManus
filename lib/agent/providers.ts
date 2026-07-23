import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { Provider } from "@/lib/pricing";

export interface ResolvedKey {
  provider: Provider;
  apiKey: string;
  baseUrl: string | null;
  model: string;
}

/**
 * Returns an AI SDK LanguageModel for the given provider/key.
 * Anthropic prompt caching is applied via `providerOptions.anthropic.cacheControl`
 * on the system prompt in lib/agent/systemPrompt.ts, not here.
 */
export function resolveLanguageModel(resolved: ResolvedKey) {
  switch (resolved.provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey: resolved.apiKey });
      return anthropic(resolved.model);
    }
    case "openai": {
      const openai = createOpenAI({
        apiKey: resolved.apiKey,
        baseURL: resolved.baseUrl || undefined,
      });
      return openai(resolved.model);
    }
    case "kimi": {
      // Moonshot's Kimi API is OpenAI-compatible.
      const kimi = createOpenAI({
        apiKey: resolved.apiKey,
        baseURL: resolved.baseUrl || "https://api.moonshot.cn/v1",
      });
      return kimi(resolved.model);
    }
    case "groq": {
      const groq = createGroq({
        apiKey: resolved.apiKey,
        baseURL: resolved.baseUrl || undefined,
      });
      return groq(resolved.model);
    }
    case "gemini": {
      const google = createGoogleGenerativeAI({
        apiKey: resolved.apiKey,
        baseURL: resolved.baseUrl || undefined,
      });
      return google(resolved.model);
    }
    default:
      throw new Error(`Unknown provider: ${resolved.provider}`);
  }
}

/**
 * Lightweight, cheap validation call used by Settings before persisting a key.
 * Uses a 1-token completion rather than a full models-list call so it works
 * uniformly across providers with an OpenAI-compatible or native SDK.
 */
export async function validateApiKey(resolved: ResolvedKey): Promise<{ ok: boolean; error?: string }> {
  try {
    const { generateText } = await import("ai");
    const model = resolveLanguageModel(resolved);
    await generateText({
      model,
      messages: [{ role: "user", content: "Reply with just: ok" }],
      maxTokens: 5,
    });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Key validation failed" };
  }
}
