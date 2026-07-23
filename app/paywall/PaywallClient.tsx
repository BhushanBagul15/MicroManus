"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export function PaywallClient({ isTopUp }: { isTopUp: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [payingLoading, setPayingLoading] = useState(false);

  async function redeemCoupon(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRedeeming(true);
    try {
      const res = await fetch("/api/coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Invalid coupon code");
        return;
      }
      router.push("/chat");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setRedeeming(false);
    }
  }

  async function payWithCard() {
    setPayingLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || "Could not start checkout");
        setPayingLoading(false);
      }
    } catch {
      setError("Could not start checkout");
      setPayingLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">
            {isTopUp ? "You're out of chat credits" : "Unlock MicroManus"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isTopUp
              ? "Redeem a coupon or pay $5 for 5 more new-chat credits."
              : "5 credits — one credit per new chat thread. Existing chats stay usable regardless of credits."}
          </p>
        </div>

        <form onSubmit={redeemCoupon} className="space-y-2">
          <label className="text-sm font-medium">Have a coupon code?</label>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. SID_DRDROID"
              className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              type="submit"
              disabled={redeeming || !code}
              className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {redeeming ? <Loader2 className="h-4 w-4 animate-spin" /> : "Redeem"}
            </button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          or
          <div className="h-px flex-1 bg-border" />
        </div>

        <button
          onClick={payWithCard}
          disabled={payingLoading}
          className="w-full rounded-lg border border-border bg-card px-4 py-3 font-medium hover:bg-muted transition-colors disabled:opacity-60"
        >
          {payingLoading ? "Redirecting to checkout..." : "Add card & pay $5"}
        </button>
        <p className="text-xs text-center text-muted-foreground">
          Test mode — use card 4242 4242 4242 4242, any future date, any CVC.
        </p>
      </div>
    </main>
  );
}
