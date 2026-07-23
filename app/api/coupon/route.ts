import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  }

  const { code } = await request.json();
  if (!code || typeof code !== "string") {
    return NextResponse.json({ ok: false, error: "Missing coupon code" }, { status: 400 });
  }

  // Case-sensitive by design (per spec) — no .toUpperCase() normalization.
  const { data, error } = await supabase.rpc("redeem_coupon", {
    p_user_id: user.id,
    p_code: code,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: "Server error validating coupon" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ok: false, error: "Invalid or inactive coupon code" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
