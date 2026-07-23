"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MessageSquarePlus, Settings, Receipt, LogOut } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Thread {
  id: string;
  title: string;
  created_at: string;
}

export function Sidebar({
  threads,
  credits,
  email,
  avatarUrl,
}: {
  threads: Thread[];
  credits: number;
  email: string;
  avatarUrl?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function newChat() {
    if (credits <= 0) {
      router.push("/paywall");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/threads", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.thread?.id) {
        router.push(`/chat/${data.thread.id}`);
        router.refresh();
      } else if (data.error === "no_credits") {
        router.push("/paywall");
      }
    } finally {
      setCreating(false);
    }
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <aside className="w-72 shrink-0 border-r border-border bg-card flex flex-col h-full">
      <div className="p-4 border-b border-border">
        <div className="text-sm font-semibold mb-3">MicroManus</div>
        <button
          onClick={newChat}
          disabled={creating}
          className="w-full flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New Chat
        </button>
        <p className="text-xs text-muted-foreground mt-2">
          {credits} chat credit{credits === 1 ? "" : "s"} left
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {threads.length === 0 && (
          <p className="text-xs text-muted-foreground px-3 py-4">No chats yet — start one above.</p>
        )}
        {threads.map((t) => (
          <Link
            key={t.id}
            href={`/chat/${t.id}`}
            className={cn(
              "block rounded-md px-3 py-2 text-sm truncate transition-colors",
              pathname === `/chat/${t.id}` ? "bg-muted font-medium" : "hover:bg-muted/60"
            )}
          >
            {t.title}
          </Link>
        ))}
      </nav>

      <div className="p-2 border-t border-border space-y-0.5">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
            pathname === "/settings" ? "bg-muted font-medium" : "hover:bg-muted/60"
          )}
        >
          <Settings className="h-4 w-4" /> Settings
        </Link>
        <Link
          href="/billing"
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
            pathname === "/billing" ? "bg-muted font-medium" : "hover:bg-muted/60"
          )}
        >
          <Receipt className="h-4 w-4" /> Billing
        </Link>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
        <div className="px-3 pt-2 text-xs text-muted-foreground truncate">{email}</div>
      </div>
    </aside>
  );
}
