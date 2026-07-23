import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe, UNLOCK_PRICE_USD } from "@/lib/stripe";

export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: "MicroManus unlock (+5 chat credits)" },
          unit_amount: UNLOCK_PRICE_USD * 100,
        },
        quantity: 1,
      },
    ],
    metadata: { user_id: user.id },
    success_url: `${appUrl}/paywall?payment=success`,
    cancel_url: `${appUrl}/paywall?payment=cancelled`,
  });

  // Record the pending payment so /billing-adjacent admin views can reconcile even
  // before the webhook fires.
  await supabase.from("payments").insert({
    user_id: user.id,
    stripe_session_id: session.id,
    amount_usd: UNLOCK_PRICE_USD,
    status: "pending",
  });

  return NextResponse.json({ url: session.url });
}
