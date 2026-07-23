# DEPLOY.md — MicroManus Deployment Guide

Follow these steps in order. Total time: ~30–45 minutes. By the end you'll have a live URL you
can hand to an end user with zero further explanation.

## 0. Prerequisites

- A GitHub account (to push this repo and to register the GitHub OAuth app)
- A Google Cloud account (for Google OAuth)
- A Supabase account (free tier is fine)
- A Stripe account (test mode only — no live keys needed)
- A Brave Search API account (free tier: 2,000 queries/month)
- A Vercel account, with the Vercel CLI installed (`npm i -g vercel`) or GitHub integration

---

## 1. Supabase project

1. Go to https://supabase.com/dashboard → **New project**. Pick any name/region, set a DB
   password (save it, you won't need it again after setup).
2. Once provisioned, open **SQL Editor** → **New query**, paste the entire contents of
   `supabase/schema.sql` from this repo, and run it. This creates every table, RLS policy,
   the `redeem_coupon` function, the auth-trigger that seeds `public.users`, and the private
   `reports` storage bucket. It's idempotent — safe to re-run if you hit an error and retry.
3. Go to **Project Settings → API**. Copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret — server-only)
4. Go to **Authentication → URL Configuration**. Set:
   - **Site URL**: `https://your-app.vercel.app` (your eventual Vercel URL — you can update
     this after step 6 once you know the real domain)
   - **Redirect URLs**: add `https://your-app.vercel.app/auth/callback` and, for local dev,
     `http://localhost:3000/auth/callback`

---

## 2. GitHub OAuth app

1. Go to https://github.com/settings/developers → **New OAuth App**.
2. **Homepage URL**: `https://your-app.vercel.app`
3. **Authorization callback URL**: this must be your **Supabase** callback, not your app's:
   `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`
4. Register, copy the **Client ID**, generate and copy a **Client Secret**.
5. In Supabase: **Authentication → Providers → GitHub** → paste Client ID + Secret → enable →
   save.

---

## 3. Google OAuth app

1. Go to https://console.cloud.google.com/apis/credentials → **Create Credentials → OAuth
   client ID**. If prompted, configure the consent screen first (External, add your app name,
   support email; test mode is fine for grading/demo purposes).
2. Application type: **Web application**.
3. **Authorized redirect URIs**: `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`
4. Create, copy the **Client ID** and **Client Secret**.
5. In Supabase: **Authentication → Providers → Google** → paste Client ID + Secret → enable →
   save.

---

## 4. Brave Search API

1. Go to https://api.search.brave.com/app/keys → sign up, create a key on the free (or paid)
   Data for AI plan.
2. Copy the key → `BRAVE_SEARCH_API_KEY`.

---

## 5. Stripe (test mode)

1. Go to https://dashboard.stripe.com → make sure the **Test mode** toggle (top right) is on.
2. **Developers → API keys** → copy the **Secret key** (`sk_test_...`) → `STRIPE_SECRET_KEY`.
3. Webhook: **Developers → Webhooks → Add endpoint**.
   - Endpoint URL: `https://your-app.vercel.app/api/stripe/webhook`
   - Events to send: `checkout.session.completed`
   - Create, then copy the **Signing secret** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`.
   - (You can only get the real endpoint + secret after the first Vercel deploy, since it
     needs a live URL — deploy once with a placeholder, then come back and fill this in, then
     redeploy or just update the env var and redeploy.)
4. Test card for the acceptance flow: `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP.

---

## 6. Encryption key

Generate a 32-byte base64 key locally:

```bash
openssl rand -base64 32
```

→ `ENCRYPTION_KEY`. Do not reuse this across environments; generate a fresh one per deployment.

---

## 7. Vercel environment variables

In your Vercel project → **Settings → Environment Variables**, add all of these (Production +
Preview + Development):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL          # e.g. https://your-app.vercel.app
ENCRYPTION_KEY
BRAVE_SEARCH_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

Notably **absent on purpose**: any OpenAI/Anthropic/Kimi API key. The app is unusable for chat
until an end user adds their own key via `/settings` — do not add one here "for testing."

---

## 8. Deploy

From the repo root:

```bash
npm install
vercel login
vercel link      # create/select the Vercel project
vercel --prod
```

Or connect the GitHub repo to Vercel via the dashboard (**Add New → Project → Import Git
Repository**) for auto-deploys on push — same env vars apply either way.

After the first deploy, go back to:
- **Supabase → Authentication → URL Configuration** and set the Site URL / Redirect URLs to
  the real `*.vercel.app` domain if you used a placeholder earlier.
- **Stripe → Webhooks** and confirm the endpoint URL matches your real domain (update + copy a
  fresh signing secret into `STRIPE_WEBHOOK_SECRET` if you changed the URL, then redeploy).

---

## 9. Smoke test (mirrors the acceptance scenario in the build spec)

1. Visit the live URL → **Continue with GitHub**.
2. You should land on `/paywall`. Enter coupon `SID_DRDROID` → redirected into the app with 5
   credits.
3. Go to **Settings** → pick a provider → paste a real API key for that provider → pick a
   model → **Save & validate**. You should see "Key validated and saved."
4. Click **+ New Chat** → ask: *"Create a report explaining the recent forest fires in
   California, what is causing them, and what can be done to avoid them"*. Watch the agent
   trace: multiple `web_search` calls, a `fetch_url` call or two, then a final answer with a
   downloadable PDF card.
5. Start a second, unrelated chat (consumes another credit).
6. Go to **/billing** — two rows, one per thread, with token/cost numbers that match the
   model(s) actually used.

---

## Local development

```bash
cp .env.example .env.local   # fill in the same values as above
npm install
npm run dev
```

Note: the Stripe webhook won't reach `localhost` directly — use the Stripe CLI
(`stripe listen --forward-to localhost:3000/api/stripe/webhook`) if you need to test payments
locally; the coupon path works without it.
