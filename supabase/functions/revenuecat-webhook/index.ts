// RevenueCat → Supabase: keeps each user's plan in profiles, and profiles.is_premium (what the storage
// rules check before a certificate can be opened) in step with the App Store.
//
// RevenueCat calls this on every subscription event (trial started, renewed, upgraded, cancelled,
// expired, refunded…). Rather than interpret each event type, it asks RevenueCat for the customer's
// current entitlements and writes those — so a missed or out-of-order event can't leave a wrong state.
//
// Deploy without JWT checks (RevenueCat doesn't sign in to Supabase):
//   npx supabase functions deploy revenuecat-webhook --no-verify-jwt --project-ref rnoapuczwpwrkbeksdak
// Secrets (Supabase → Edge Functions → Secrets):
//   REVENUECAT_WEBHOOK_AUTH  — any long random string; paste the same value into RevenueCat's webhook
//                              "Authorization header value".
//   REVENUECAT_SECRET_KEY    — RevenueCat → Project settings → API keys → secret key (starts sk_).
import { createClient } from "npm:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const key = (name: string, legacy: string) => {
  try {
    const keys = JSON.parse(Deno.env.get(name) ?? "{}");
    return keys.default ?? Object.values(keys)[0] ?? Deno.env.get(legacy);
  } catch {
    return Deno.env.get(legacy);
  }
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Entitlement = { expires_date: string | null; product_identifier: string; purchase_date: string };
type Subscription = { period_type?: string; expires_date?: string | null };

Deno.serve(async req => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const expected = Deno.env.get("REVENUECAT_WEBHOOK_AUTH");
  const got = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || got !== expected) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  const event = body?.event;
  if (!event) return json({ error: "No event" }, 400);
  if (event.type === "TEST") return json({ ok: true, test: true });

  // The app logs in to RevenueCat with the Supabase user id; anonymous ids ($RCAnonymousID:…) are skipped.
  const ids: string[] = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])].filter(Boolean);
  const userId = ids.find(id => UUID.test(id));
  if (!userId) return json({ ok: true, skipped: "no Supabase user id" });

  const rc = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${Deno.env.get("REVENUECAT_SECRET_KEY")}` },
  });
  if (!rc.ok) return json({ error: `RevenueCat lookup failed (${rc.status})` }, 502); // RevenueCat retries
  const subscriber = (await rc.json()).subscriber ?? {};
  const ents: Record<string, Entitlement> = subscriber.entitlements ?? {};
  const subs: Record<string, Subscription> = subscriber.subscriptions ?? {};
  const now = Date.now();
  const active = (e?: Entitlement) => !!e && (!e.expires_date || Date.parse(e.expires_date) > now);

  const premium = ents.premium, base = ents.base;
  const plan = active(premium) ? "premium" : active(base) ? "base" : "none";
  const current = plan === "premium" ? premium : plan === "base" ? base : null;
  const trial = !!current && subs[current.product_identifier]?.period_type === "trial";

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, key("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: profile } = await admin.from("profiles").select("comp_premium").eq("user_id", userId).maybeSingle();
  const update: Record<string, unknown> = {
    plan, plan_until: current?.expires_date ?? null, plan_trial: trial, plan_updated_at: new Date().toISOString(),
  };
  // A hand-granted Premium (comp_premium) is left alone.
  if (!profile?.comp_premium) {
    update.is_premium = plan === "premium";
    update.premium_until = plan === "premium" ? premium.expires_date : null;
  }
  const { error } = await admin.from("profiles").upsert({ user_id: userId, ...update, updated_at: new Date().toISOString() });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, plan });
});
