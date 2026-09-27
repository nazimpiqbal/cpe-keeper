// Deletes one of the signed-in user's uploaded files (and its entry in the uploads list).
// Runs on the server because storage rules only let Premium users read files,
// and Supabase requires read access to delete.
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

  const { path } = await req.json().catch(() => ({}));
  if (typeof path !== "string" || !path.startsWith(`${user.id}/`)) return json({ error: "Invalid file." }, 400);

  // Don't delete a file that a saved course still points to.
  const { count } = await userClient.from("cpe_records").select("id", { count: "exact", head: true }).eq("certificate_path", path);
  if (count) return json({ error: "This file is attached to a course. Delete or change the course first." }, 409);

  const admin = createClient(url, key("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await admin.storage.from("certificates").remove([path]);
  if (error) return json({ error: "Couldn't delete the file." }, 500);
  await userClient.from("uploads").delete().eq("path", path);
  return json({ ok: true });
});
