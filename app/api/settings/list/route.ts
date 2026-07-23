import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const { data } = await supabase
    .from("provider_keys")
    .select("provider, default_model, key_last4")
    .eq("user_id", user.id);

  return NextResponse.json({ keys: data ?? [] });
}
