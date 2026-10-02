import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "./supabase";

type Premium = { premium: boolean; loading: boolean; refresh: () => Promise<void> };
const Ctx = createContext<Premium>({ premium: false, loading: true, refresh: async () => {} });

// Reads the signed-in user's Premium status. It can only be changed on the server
// (by us now; by the App Store purchase flow later) — the app just reads it.
export function PremiumProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [premium, setPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("is_premium, premium_until").eq("user_id", userId).maybeSingle();
    const active = !!data?.is_premium && (!data.premium_until || new Date(data.premium_until) > new Date());
    setPremium(active);
    setLoading(false);
  }, [userId]);
  useEffect(() => { refresh(); }, [refresh]);
  return <Ctx.Provider value={{ premium, loading, refresh }}>{children}</Ctx.Provider>;
}

export const usePremium = () => useContext(Ctx);

// More than one state license is a Premium feature (flip to false to make it free).
export const MULTI_LICENSE_PREMIUM = true;

// Placeholder until App Store purchases are wired up (RevenueCat).
export function showUpgrade(reason: "certificates" | "licenses" = "certificates") {
  Alert.alert(
    "CPE Keeper Premium",
    reason === "licenses"
      ? "Track more than one state license. Each course counts toward every state you hold, with a dashboard and audit report for each.\n\nPremium purchases are coming soon."
      : "Open, download and share any of your certificates — ready to send if the board audits you.\n\nYour certificates are already safely stored. Upgrading unlocks access to them.\n\nPremium purchases are coming soon.",
    [{ text: "OK" }],
  );
}
