import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("users")
    .select("credits, email, avatar_url")
    .eq("id", user.id)
    .single();

  const { data: threads } = await supabase
    .from("chat_threads")
    .select("id, title, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex h-screen">
      <Sidebar
        threads={threads ?? []}
        credits={profile?.credits ?? 0}
        email={profile?.email ?? user.email ?? ""}
        avatarUrl={profile?.avatar_url ?? undefined}
      />
      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
    </div>
  );
}
