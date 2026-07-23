import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { data: thread } = await supabase
    .from("chat_threads")
    .select("id, title, user_id")
    .eq("id", params.id)
    .single();

  if (!thread || thread.user_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: messages } = await supabase
    .from("chat_messages")
    .select("id, role, content, tool_calls_json, created_at")
    .eq("thread_id", params.id)
    .order("created_at", { ascending: true });

  const { data: reports } = await supabase
    .from("reports")
    .select("id, message_id, title, storage_url, created_at")
    .eq("thread_id", params.id);

  return NextResponse.json({ thread, messages: messages ?? [], reports: reports ?? [] });
}
