// Permanently deletes the signed-in user's account: every uploaded certificate file,
// then the user itself. Licenses, courses, uploads list and profile rows are removed
// automatically by the database (they reference auth.users with "on delete cascade").
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const key = (name: string, legacy: string) => {
  try {
    const keys = JSON.parse(Deno.env.get(name) ?? "{}");
    return keys.default ?? Object.values(keys)[0] ?? Deno.env.get(legacy);
  } catch {
    return Deno.env.get(legacy);
  }
};

Deno.serve(async req => {
  if (req.method === "OPTIONS") return json({ ok: true });
  const url = Deno.env.get("SUPABASE_URL")!;
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, key("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser(auth.replace("Bearer ", ""));
  if (!user) return json({ error: "Not signed in." }, 401);

  const admin = createClient(url, key("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY")!);
  const bucket = admin.storage.from("certificates");

  // 1. Delete every file in the user's folder, a page at a time.
  for (let round = 0; round < 50; round++) {
    const { data: files, error } = await bucket.list(user.id, { limit: 1000 });
    if (error) return json({ error: "Couldn't delete your files. Please try again." }, 500);
    if (!files?.length) break;
    const { error: rmError } = await bucket.remove(files.map(f => `${user.id}/${f.name}`));
    if (rmError) return json({ error: "Couldn't delete your files. Please try again." }, 500);
  }

  // 2. Delete the user; their rows go with it.
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return json({ error: "Couldn't delete your account. Please try again." }, 500);
  return json({ ok: true });
});
