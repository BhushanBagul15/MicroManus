import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatClient } from "./ChatClient";

export default async function ChatThreadPage({ params }: { params: { threadId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: thread } = await supabase
    .from("chat_threads")
    .select("id, title, user_id")
    .eq("id", params.threadId)
    .single();

  if (!thread || thread.user_id !== user.id) redirect("/chat");

  const { data: messages } = await supabase
    .from("chat_messages")
    .select("id, role, content, tool_calls_json, created_at")
    .eq("thread_id", params.threadId)
    .order("created_at", { ascending: true });

  const { data: reports } = await supabase
    .from("reports")
    .select("id, message_id, title, storage_url")
    .eq("thread_id", params.threadId);

  const { data: keys } = await supabase
    .from("provider_keys")
    .select("provider, default_model")
    .eq("user_id", user.id);

  return (
    <ChatClient
      threadId={thread.id}
      threadTitle={thread.title}
      initialMessages={messages ?? []}
      reports={reports ?? []}
      availableKeys={keys ?? []}
    />
  );
}
