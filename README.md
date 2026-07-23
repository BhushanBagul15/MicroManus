# MicroManus

A bring-your-own-key deep research agent. Sign in, unlock via coupon or a $5 payment, add your
own OpenAI/Anthropic/Kimi API key, and get a chat agent that visibly searches the web, reads
sources, and produces downloadable PDF reports — with every dollar of your own LLM spend tracked
per thread down to the cached token.

See `DEPLOY.md` for how to stand this up from scratch.

## Architecture

- **Next.js 14 App Router**, single repo for frontend + backend (route handlers, no separate API
  service).
- **Auth**: Supabase Auth, GitHub + Google OAuth only. `middleware.ts` runs on every route and
  redirects (a) signed-out users to `/`, and (b) signed-in-but-not-unlocked users to `/paywall` —
  this is a hard server-side gate, not a UI-level hide.
- **Data**: Postgres via Supabase, RLS-scoped to `auth.uid()` on every user-owned table. See
  `supabase/schema.sql` for the full schema, policies, the `redeem_coupon()` SECURITY DEFINER
  function (atomic unlock + credit grant + coupon-usage increment), and the trigger that seeds a
  `public.users` row on first sign-in.
- **Storage**: a private `reports` Supabase Storage bucket, one folder per user, objects served
  back to the browser via short-lived signed URLs (never made public).
- **Payments**: Stripe Checkout (test mode) for the $5 unlock path, `/api/stripe/webhook` verifies
  the signature and grants `is_unlocked = true, credits += 5` on `checkout.session.completed`.
- **LLM access**: BYOK. Keys are AES-256-GCM encrypted at rest (`lib/encryption.ts`,
  `ENCRYPTION_KEY` env var) and never sent back to the browser after saving — only a masked
  `sk-...ab12`-style string is returned. No LLM provider key exists anywhere in server env vars;
  the app is structurally incapable of making a chat completion until a user adds their own key.

## The agent loop

`app/api/chat/route.ts` is the whole loop. It uses the Vercel AI SDK's `streamText` with
`maxSteps: 10` and three tools (`lib/tools/`):

- `web_search` — Brave Search API (server-owned key; this is infra the app owns, not a
  per-user credential, per the build spec).
- `fetch_url` — fetches a page and strips it down to readable text (dependency-free HTML
  extraction; no headless browser).
- `create_pdf_report` — renders markdown to a polished PDF with `@react-pdf/renderer`, uploads
  it to the `reports` bucket, inserts a `reports` row, and returns a signed download URL.

The system prompt (`lib/agent/systemPrompt.ts`) explicitly instructs the model to think out loud
before each tool call and to search from multiple angles before writing the final answer. Every
step — the model's intermediate text, each tool call's arguments, and a summarized result — is
streamed to the client via the AI SDK's data stream protocol and rendered live as an "agent
trace" (`components/AgentTraceStep.tsx`), expandable to see full args/results, sitting above the
final answer. Nothing is hidden.

On `onFinish`, the full turn (final text + the tool-call/result trace as `tool_calls_json`) is
persisted to `chat_messages`, so it replays as real context on the next turn in that thread.
Threads never share context with each other — each API call only sends that thread's own
history.

## Cost & caching calculation

`lib/pricing.ts` is a static, hand-maintained table of exact per-model rates (input, output,
cache-read, cache-write — USD per 1M tokens), researched from provider pricing pages as of
2026-07-22. Every model has its own row; nothing is priced off a blended/average rate.

On every `onStepFinish` (i.e. every individual model call within the agent loop, not just the
final one), MicroManus reads `usage` and `providerMetadata` off the AI SDK step result:

- **Anthropic**: prompt caching is opted into via `providerOptions.anthropic.cacheControl` on
  the system message (`lib/agent/systemPrompt.ts`), and the resulting
  `cacheReadInputTokens` / `cacheCreationInputTokens` are read back off
  `providerMetadata.anthropic` and billed at their own distinct rates — never folded into
  `input_tokens`.
- **OpenAI / Kimi** (OpenAI-compatible): caching is automatic server-side; cached-read tokens are
  read off `providerMetadata.openai.cachedPromptTokens` where the SDK surfaces it.

Each step becomes one row in `usage_events` (`thread_id, message_id, model, provider,
input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd`), with `cost_usd`
computed by `computeCostUsd()` against the exact pricing row for that exact model. `/billing`
does not maintain any separate running total — it sums `usage_events` live, grouped by thread,
so the numbers are always reconciled with the underlying log by construction.

> **Note on SDK field names**: `providerMetadata` field names for cache token counts are one of
> the faster-moving parts of the `ai` / `@ai-sdk/*` packages. The names used in
> `app/api/chat/route.ts` are commented in place and should be verified against whatever
> `@ai-sdk/anthropic` / `@ai-sdk/openai` versions actually land in `npm install` — check each
> provider's AI SDK changelog if cache tokens show up as 0 unexpectedly.

## Credits vs. cost — two separate systems

- **Chat credits** (`users.credits`): an app-level unlock mechanic. 5 credits granted per
  unlock/top-up. One credit is consumed per **new thread created** (`api/threads/route.ts`);
  existing threads stay usable indefinitely regardless of remaining credits. This has nothing to
  do with token cost.
- **Token cost** (`usage_events`, shown on `/billing`): the user's own real LLM API spend via
  their own key, tracked per model call at exact provider rates. Independent of credits.

## Known simplifications

- `fetch_url`'s HTML-to-text extraction is a lightweight regex-based strip, not a full
  readability engine — good enough for article/doc pages, will be noisier on heavily
  JS-rendered sites.
- The markdown → PDF renderer in `create_pdf_report` supports headings, bullets, and paragraphs
  (not tables/links/bold inline spans) — sufficient for agent-generated report structure.
- Model pricing is a point-in-time snapshot; providers change prices without notice, see the
  note in `lib/pricing.ts`.
