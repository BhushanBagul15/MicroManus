import { streamText, type CoreMessage } from "ai";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/encryption";
import { resolveLanguageModel } from "@/lib/agent/providers";
import { buildSystemMessage } from "@/lib/agent/systemPrompt";
import { webSearchTool } from "@/lib/tools/webSearch";
import { fetchUrlTool } from "@/lib/tools/fetchUrl";
import { makeCreatePdfReportTool } from "@/lib/tools/createPdfReport";
import { computeCostUsd } from "@/lib/pricing";

export const maxDuration = 300; // agent loops with web research can run long

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { messages, threadId, provider } = (await request.json()) as {
    messages: CoreMessage[];
    threadId: string;
    provider: "openai" | "anthropic" | "kimi" | "groq" | "gemini";
  };

  // --- Verify thread ownership ---
  const { data: thread } = await supabase
    .from("chat_threads")
    .select("id, title, user_id")
    .eq("id", threadId)
    .single();
  if (!thread || thread.user_id !== user.id) {
    return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
  }

  // --- Load + decrypt the requested provider's key ---
  const { data: keyRow } = await supabase
    .from("provider_keys")
    .select("provider, encrypted_api_key, base_url, default_model")
    .eq("user_id", user.id)
    .eq("provider", provider)
    .single();

  if (!keyRow) {
    return NextResponse.json(
      { error: "no_key_configured", message: `No ${provider} key configured. Add one in Settings.` },
      { status: 400 }
    );
  }

  const apiKey = decrypt(keyRow.encrypted_api_key);
  const model = keyRow.default_model;

  // --- Persist the incoming user message ---
  const lastUserMessage = messages[messages.length - 1];
  const userContent =
    typeof lastUserMessage.content === "string"
      ? lastUserMessage.content
      : JSON.stringify(lastUserMessage.content);

  await supabase.from("chat_messages").insert({
    thread_id: threadId,
    role: "user",
    content: userContent,
  });

  // Title the thread from the first ~6 words of the user's first message.
  if (thread.title === "New chat") {
    const words = userContent.trim().split(/\s+/).slice(0, 6).join(" ");
    await supabase
      .from("chat_threads")
      .update({ title: words.length > 0 ? words : "New chat" })
      .eq("id", threadId);
  }

  const languageModel = resolveLanguageModel({ provider, apiKey, baseUrl: keyRow.base_url, model });
  const systemMessage = buildSystemMessage(provider);
  // providerOptions (used for Anthropic's cache_control) must live on the message object
  // itself — there is no valid top-level streamText `providerOptions` for this. Prepending
  // the system message here (rather than using streamText's `system:` string shorthand) is
  // what makes cache_control apply.
  const messagesWithSystem: CoreMessage[] = [systemMessage as unknown as CoreMessage, ...messages];

  const stepUsages: Array<{
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  }> = [];

  const result = streamText({
    model: languageModel,
    messages: messagesWithSystem,
    maxSteps: 10,
    tools: {
      web_search: webSearchTool,
      fetch_url: fetchUrlTool,
      create_pdf_report: makeCreatePdfReportTool({ userId: user.id, threadId }),
    },
    onStepFinish: ({ usage, providerMetadata }) => {
      // NOTE: field names for cache token counts differ by provider/SDK version.
      // Anthropic (via @ai-sdk/anthropic) surfaces cacheCreationInputTokens /
      // cacheReadInputTokens on providerMetadata.anthropic. OpenAI-compatible
      // providers (OpenAI, Kimi) currently don't expose a separate cache-write
      // count — their caching is automatic and only cache-read tokens are billed
      // differently, surfaced (when available) as cachedPromptTokens. Verify these
      // field names against the installed `ai` / `@ai-sdk/*` versions — this is a
      // fast-moving part of the SDK.
      const anthropicMeta = (providerMetadata as any)?.anthropic;
      const openaiMeta = (providerMetadata as any)?.openai;

      const cacheReadTokens =
        anthropicMeta?.cacheReadInputTokens ?? openaiMeta?.cachedPromptTokens ?? 0;
      const cacheWriteTokens = anthropicMeta?.cacheCreationInputTokens ?? 0;

      stepUsages.push({
        inputTokens: Math.max(0, (usage?.promptTokens ?? 0) - cacheReadTokens - cacheWriteTokens),
        outputTokens: usage?.completionTokens ?? 0,
        cacheReadTokens,
        cacheWriteTokens,
      });
    },
    onFinish: async ({ text, steps, response }) => {
      // Persist the assistant's full turn: final text + the tool call/result trace,
      // so the thread can be replayed as context for the next turn (spec section 9).
      const toolTrace = steps.flatMap((s) =>
        s.toolCalls.map((tc, i) => ({
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          args: tc.args,
          result: s.toolResults[i]?.result ?? null,
        }))
      );

      const { data: assistantMsg } = await supabase
        .from("chat_messages")
        .insert({
          thread_id: threadId,
          role: "assistant",
          content: text,
          tool_calls_json: toolTrace.length > 0 ? toolTrace : null,
        })
        .select("id")
        .single();

      // Log one usage_event per model call (per step), each priced at the exact
      // rate for the model actually used, with cache tokens attributed separately
      // per spec section 3 (never silently merged into input_tokens).
      const events = stepUsages.map((u) => ({
        thread_id: threadId,
        message_id: assistantMsg?.id ?? null,
        model,
        provider,
        input_tokens: u.inputTokens,
        output_tokens: u.outputTokens,
        cache_read_tokens: u.cacheReadTokens,
        cache_write_tokens: u.cacheWriteTokens,
        cost_usd: computeCostUsd(model, {
          inputTokens: u.inputTokens,
          outputTokens: u.outputTokens,
          cacheReadTokens: u.cacheReadTokens,
          cacheWriteTokens: u.cacheWriteTokens,
        }),
      }));

      if (events.length > 0) {
        await supabase.from("usage_events").insert(events);
      }
    },
  });

  return result.toDataStreamResponse({
    getErrorMessage: (error) => {
      console.error("[api/chat] stream error:", error);
      if (error instanceof Error) return error.message;
      return typeof error === "string" ? error : "Unknown error — check server logs.";
    },
  });
}
