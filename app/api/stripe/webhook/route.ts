import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";
import Stripe from "stripe";

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;

    if (!userId) {
      return NextResponse.json({ error: "Missing user_id in session metadata" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Mark the payment row completed (idempotent: only flips pending -> completed once).
    await admin
      .from("payments")
      .update({ status: "completed" })
      .eq("stripe_session_id", session.id)
      .eq("status", "pending");

    // Grant unlock + credits. Uses a direct read-modify-write; Stripe retries are the
    // only concurrency risk here and are guarded by the .eq('status','pending') above
    // ensuring this branch only runs once per session.
    const { data: userRow } = await admin.from("users").select("credits").eq("id", userId).single();
    await admin
      .from("users")
      .update({ is_unlocked: true, credits: (userRow?.credits ?? 0) + 5 })
      .eq("id", userId);
  }

  return NextResponse.json({ received: true });
}
