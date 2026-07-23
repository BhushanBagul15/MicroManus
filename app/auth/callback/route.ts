import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Belt-and-suspenders: the DB trigger (handle_new_auth_user) is supposed to create
      // the matching public.users row on first sign-in, but we've seen cases where it
      // doesn't fire (e.g. deleted-and-recreated OAuth identities) — leaving a user
      // authenticated but with no row in public.users, which then breaks everything
      // downstream (paywall, payments FK constraint, etc). Upsert here so this is never
      // possible: every successful sign-in guarantees a row exists before the user goes
      // anywhere else in the app. Safe to run on every login — `onConflict: "id"` with
      // ignoreDuplicates makes this a no-op for existing users.
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const admin = createAdminClient();
        await admin.from("users").upsert(
          {
            id: user.id,
            email: user.email ?? "",
            avatar_url: (user.user_metadata?.avatar_url as string | undefined) ?? null,
            provider: user.app_metadata?.provider ?? "unknown",
          },
          { onConflict: "id", ignoreDuplicates: true }
        );
      }

      // Middleware will route to /paywall or /chat based on unlock status.
      return NextResponse.redirect(`${origin}/`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth_failed`);
}
