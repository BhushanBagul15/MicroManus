import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encrypt, maskKey } from "@/lib/encryption";
import { validateApiKey } from "@/lib/agent/providers";
import { getModelPricing } from "@/lib/pricing";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const { provider, apiKey, baseUrl, model } = await request.json();

  if (!provider || !apiKey || !model) {
    return NextResponse.json({ ok: false, error: "Missing provider, apiKey, or model" }, { status: 400 });
  }

  const pricing = getModelPricing(model);
  if (!pricing || pricing.provider !== provider) {
    return NextResponse.json({ ok: false, error: "Unknown model for this provider" }, { status: 400 });
  }

  // Trivial validation call BEFORE persisting anything, per spec.
  const result = await validateApiKey({ provider, apiKey, baseUrl: baseUrl || null, model });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error || "Key validation failed" }, { status: 400 });
  }

  const encrypted = encrypt(apiKey);
  const masked = maskKey(apiKey);

  const { error } = await supabase.from("provider_keys").upsert(
    {
      user_id: user.id,
      provider,
      encrypted_api_key: encrypted,
      key_last4: masked,
      base_url: baseUrl || null,
      default_model: model,
    },
    { onConflict: "user_id,provider" }
  );

  if (error) {
    return NextResponse.json({ ok: false, error: "Failed to save key" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, last4: masked });
}
