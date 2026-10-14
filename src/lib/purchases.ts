// App Store subscriptions through RevenueCat.
//
// Two yearly plans in ONE App Store subscription group, so a customer can only ever hold one:
//   Base     $9.99/yr  (cpekeeper_base_annual)     → RevenueCat entitlement "base"
//   Premium $19.99/yr  (cpekeeper_premium_annual)  → entitlements "base" + "premium"
// Each has a 3-day free trial (an introductory offer; Apple allows one per customer per group).
// Upgrading Base → Premium is immediate with a prorated refund; downgrading takes effect at renewal.
// Apple does all of that — the app only buys, restores and reads which entitlements are active.
//
// Premium is also enforced on the server: the revenuecat-webhook function sets profiles.is_premium,
// which the storage rules check before letting anyone open a certificate.
import { Linking, Platform } from "react-native";
import Purchases, { CustomerInfo, PurchasesPackage } from "react-native-purchases";

export const PRODUCTS = { base: "cpekeeper_base_annual", premium: "cpekeeper_premium_annual" } as const;
export const ENTITLEMENTS = { base: "base", premium: "premium" } as const;
// Shown when the App Store can't be reached (and in Expo Go). StoreKit's localized prices replace them.
export const FALLBACK_PRICES = { base: "$9.99", premium: "$19.99" } as const;
export const TRIAL_DAYS = 3;

export type PlanId = "base" | "premium";
export type Plan = "none" | PlanId;
export type PlanStatus = { plan: Plan; trial: boolean; expires: string | null; willRenew: boolean };
export type PlanOption = {
  id: PlanId;
  pkg: PurchasesPackage | null;   // null when the store isn't available
  price: string;                  // "$9.99"
  trialDays: number | null;       // free-trial length if this customer can still get one
};

const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";
let configuredFor: string | null = null;

// False in Expo Go (RevenueCat runs in a mock "preview" mode there) and when the key isn't set.
export const storeAvailable = () => Platform.OS === "ios" && !!API_KEY && !isExpoGo();
function isExpoGo() {
  return !!(globalThis as { expo?: { modules?: { ExpoGo?: unknown } } }).expo?.modules?.ExpoGo;
}

// Call once the user is signed in. Purchases are tied to the Supabase user id, so they follow the
// account (not the device) and the webhook knows whose profile to update.
export async function startPurchases(userId: string) {
  if (!storeAvailable() || configuredFor === userId) return;
  if (configuredFor === null) Purchases.configure({ apiKey: API_KEY, appUserID: userId });
  else await Purchases.logIn(userId);
  configuredFor = userId;
}

export async function endPurchases() {
  if (!storeAvailable() || configuredFor === null) return;
  await Purchases.logOut().catch(() => {});
  configuredFor = null;
}

export function statusFrom(info: CustomerInfo): PlanStatus {
  const active = info.entitlements.active;
  const ent = active[ENTITLEMENTS.premium] ?? active[ENTITLEMENTS.base];
  if (!ent) return { plan: "none", trial: false, expires: null, willRenew: false };
  return {
    plan: active[ENTITLEMENTS.premium] ? "premium" : "base",
    trial: ent.periodType === "TRIAL",
    expires: ent.expirationDate,
    willRenew: ent.willRenew,
  };
}

export async function currentStatus(): Promise<PlanStatus | null> {
  if (!storeAvailable() || !configuredFor) return null;
  return statusFrom(await Purchases.getCustomerInfo());
}

export function onStatusChange(cb: (s: PlanStatus) => void): () => void {
  if (!storeAvailable()) return () => {};
  const listener = (info: CustomerInfo) => cb(statusFrom(info));
  Purchases.addCustomerInfoUpdateListener(listener);
  return () => { Purchases.removeCustomerInfoUpdateListener(listener); };
}

// The two plans with the customer's real, localized prices and whether they still qualify for the trial.
export async function loadPlans(): Promise<PlanOption[]> {
  const fallback = (id: PlanId): PlanOption => ({ id, pkg: null, price: FALLBACK_PRICES[id], trialDays: TRIAL_DAYS });
  if (!storeAvailable() || !configuredFor) return [fallback("base"), fallback("premium")];
  const offerings = await Purchases.getOfferings();
  const pkgs = offerings.current?.availablePackages ?? [];
  const find = (id: PlanId) => pkgs.find(p => p.product.identifier === PRODUCTS[id]) ?? null;
  let eligible: Record<string, { status: number }> = {};
  try { eligible = await Purchases.checkTrialOrIntroductoryPriceEligibility([PRODUCTS.base, PRODUCTS.premium]); } catch { /* unknown → show it */ }
  return (["base", "premium"] as const).map(id => {
    const pkg = find(id);
    if (!pkg) return fallback(id);
    const intro = pkg.product.introPrice;
    const isFreeTrial = !!intro && intro.price === 0;
    const days = !isFreeTrial ? null
      : intro!.periodUnit === "DAY" ? intro!.periodNumberOfUnits
      : intro!.periodUnit === "WEEK" ? intro!.periodNumberOfUnits * 7 : TRIAL_DAYS;
    // INTRO_ELIGIBILITY_STATUS: 0 unknown, 1 ineligible, 2 eligible, 3 no intro offer.
    const st = eligible[PRODUCTS[id]]?.status;
    return { id, pkg, price: pkg.product.priceString, trialDays: st === 1 || st === 3 ? null : days };
  });
}

// Returns the new status, or null if the customer cancelled Apple's purchase sheet.
export async function buy(option: PlanOption): Promise<PlanStatus | null> {
  if (!option.pkg) throw new Error("The App Store isn't available right now. Please try again in a moment.");
  try {
    const { customerInfo } = await Purchases.purchasePackage(option.pkg);
    return statusFrom(customerInfo);
  } catch (e) {
    if ((e as { userCancelled?: boolean }).userCancelled) return null;
    throw e;
  }
}

export async function restore(): Promise<PlanStatus> {
  if (!storeAvailable()) throw new Error("Purchases aren't available in this build.");
  return statusFrom(await Purchases.restorePurchases());
}

// Apple's own subscription screen: change plan, cancel, or see the renewal date.
export async function manageSubscription() {
  if (storeAvailable()) {
    try { await Purchases.showManageSubscriptions(); return; } catch { /* fall through */ }
  }
  await Linking.openURL("https://apps.apple.com/account/subscriptions");
}
