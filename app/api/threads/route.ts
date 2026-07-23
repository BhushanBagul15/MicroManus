import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("users").select("credits").eq("id", user.id).single();

  if (!profile || profile.credits <= 0) {
    return NextResponse.json({ error: "no_credits" }, { status: 402 });
  }

  // Consume one credit for the new thread. Existing threads remain usable indefinitely;
  // only *new thread creation* is credit-gated (see spec section 3).
  const { error: creditError } = await supabase
    .from("users")
    .update({ credits: profile.credits - 1 })
    .eq("id", user.id)
    .eq("credits", profile.credits); // optimistic guard against a double-spend race

  if (creditError) {
    return NextResponse.json({ error: "credit_update_failed" }, { status: 500 });
  }

  const { data: thread, error } = await supabase
    .from("chat_threads")
    .insert({ user_id: user.id, title: "New chat" })
    .select("id, title, created_at")
    .single();

  if (error) {
    // Roll back the credit spend if thread creation failed.
    await supabase.from("users").update({ credits: profile.credits }).eq("id", user.id);
    return NextResponse.json({ error: "thread_create_failed" }, { status: 500 });
  }

  return NextResponse.json({ thread });
}
