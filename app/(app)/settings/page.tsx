import { createClient } from "@/lib/supabase/server";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: keys } = await supabase
    .from("provider_keys")
    .select("provider, key_last4, base_url, default_model, created_at")
    .eq("user_id", user!.id);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-1">Settings</h1>
        <p className="text-muted-foreground text-sm mb-8">
          Add your own API key for at least one provider to start chatting. Keys are encrypted
          at rest and never sent back to your browser after saving.
        </p>
        <SettingsClient existingKeys={keys ?? []} />
      </div>
    </div>
  );
}
