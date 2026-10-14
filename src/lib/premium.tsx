import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { Alert } from "react-native";
import { supabase } from "./supabase";
import { currentStatus, endPurchases, onStatusChange, Plan, PlanStatus, startPurchases, storeAvailable } from "./purchases";

// What the signed-in user has paid for.
//   access:  any active plan (Base or Premium, including a free trial) — needed to use the app at all.
//   premium: the Premium plan — opening certificates, more than one license, deadline reminders.
// Sources, either of which counts:
//   • the App Store, through RevenueCat (instant, on this device), and
//   • profiles.is_premium on the server (set by the RevenueCat webhook, or by hand as a free grant).
// The server flag is what the storage rules check, so certificate downloads stay locked without it.
type Sub = {
  loading: boolean;
  access: boolean;
  premium: boolean;
  plan: Plan;                      // the App Store plan, "none" if none
  status: PlanStatus | null;       // trial / renewal details from the App Store
  granted: boolean;                // Premium granted on the server without an App Store purchase
  refresh: () => Promise<void>;
  apply: (s: PlanStatus) => void;  // use a purchase result right away, before the server catches up
  devSkip: () => void;             // development builds only: get past the paywall without buying
};
const Ctx = createContext<Sub>({
  loading: true, access: false, premium: false, plan: "none", status: null, granted: false,
  refresh: async () => {}, apply: () => {}, devSkip: () => {},
});

export function PremiumProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [server, setServer] = useState<{ premium: boolean } | null>(null);
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [storeChecked, setStoreChecked] = useState(false);
  const [skipped, setSkipped] = useState(false);

  const refresh = useCallback(async () => {
    const [{ data }, s] = await Promise.all([
      supabase.from("profiles").select("is_premium, premium_until").eq("user_id", userId).maybeSingle(),
      currentStatus().catch(() => null),
    ]);
    setServer({ premium: !!data?.is_premium && (!data.premium_until || new Date(data.premium_until) > new Date()) });
    if (s) setStatus(s);
    setStoreChecked(true);
  }, [userId]);

  useEffect(() => {
    let off = () => {};
    (async () => {
      await startPurchases(userId).catch(() => {});
      off = onStatusChange(setStatus);
      await refresh();
    })();
    return () => { off(); };
  }, [userId, refresh]);

  // Signing out: stop tying purchases on this device to that account.
  useEffect(() => () => { endPurchases(); }, [userId]);

  const plan: Plan = status?.plan ?? "none";
  const granted = !!server?.premium && plan !== "premium";
  const premium = plan === "premium" || !!server?.premium;
  const access = premium || plan === "base" || (__DEV__ && skipped);
  const value: Sub = {
    loading: !server || !storeChecked, access, premium, plan, status, granted, refresh,
    apply: s => setStatus(s), devSkip: () => setSkipped(true),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSubscription = () => useContext(Ctx);
export const usePremium = () => { const s = useContext(Ctx); return { premium: s.premium, loading: s.loading, refresh: s.refresh }; };

// More than one state license is a Premium feature (flip to false to make it free).
export const MULTI_LICENSE_PREMIUM = true;

// "Upgrade to Premium": opens the paywall in upgrade mode. App.tsx registers the opener.
export type UpgradeReason = "certificates" | "licenses" | "reminders";
let openUpgrade: ((reason: UpgradeReason) => void) | null = null;
export function setUpgradeOpener(fn: ((reason: UpgradeReason) => void) | null) { openUpgrade = fn; }
export function showUpgrade(reason?: UpgradeReason | unknown) {
  const r: UpgradeReason = reason === "licenses" || reason === "reminders" ? reason : "certificates";
  if (openUpgrade) return openUpgrade(r);
  Alert.alert("CPE Keeper Premium", "Premium unlocks opening and sharing your certificates, more than one state license, and deadline reminders.");
}

export { storeAvailable };
