import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PaywallClient } from "./PaywallClient";

export default async function PaywallPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("users")
    .select("is_unlocked, credits")
    .eq("id", user.id)
    .single();

  // Already unlocked with credits left -> nothing to do here, go straight in.
  // (Unlocked-but-0-credits users land here too, to top up — see PaywallClient.)
  if (profile?.is_unlocked && (profile.credits ?? 0) > 0) redirect("/chat");

  return <PaywallClient isTopUp={!!profile?.is_unlocked} />;
}
