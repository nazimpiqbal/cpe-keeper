// Reads a CPE certificate (photo or PDF) the user uploaded and returns the course details.
// The Anthropic key lives only here, as the ANTHROPIC_API_KEY secret. It never reaches the app.
import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const MODEL = "claude-haiku-4-5-20251001";

const FIELDS = [
  "Accounting", "Accounting (Governmental)", "Auditing", "Auditing (Governmental)", "Taxes",
  "Regulatory Ethics", "Behavioral Ethics", "Finance", "Economics", "Business Law",
  "Management Advisory Services", "Information Technology", "Specialized Knowledge", "Statistics",
  "Business Management and Organization", "Communications and Marketing", "Computer Software and Applications",
  "Personal Development", "Personnel/Human Resources", "Production",
];
const DELIVERY = ["Group Live", "Group Internet Based", "QAS Self Study", "Nano Learning", "Blended"];

const TOOL = {
  name: "record_courses",
  description: "Record the CPE courses shown on the document.",
  input_schema: {
    type: "object",
    properties: {
      is_cpe_document: { type: "boolean", description: "False if this is not a CPE certificate or transcript." },
      courses: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            provider: { type: ["string", "null"], description: "Sponsor / provider organization name." },
            sponsor_id: { type: ["string", "null"], description: "NASBA National Registry sponsor number, if printed." },
            completed_on: { type: ["string", "null"], description: "Completion date as YYYY-MM-DD." },
            hours: { type: ["number", "null"], description: "CPE credits earned." },
            field_of_study: { type: ["string", "null"], enum: [...FIELDS, null] },
            field_confident: { type: "boolean", description: "True only if the field of study is printed on the document (or its wording maps unambiguously)." },
            delivery_method: { type: ["string", "null"], enum: [...DELIVERY, null] },
          },
          required: ["title", "provider", "sponsor_id", "completed_on", "hours", "field_of_study", "field_confident", "delivery_method"],
        },
      },
    },
    required: ["is_cpe_document", "courses"],
  },
};

const PROMPT = `Extract every completed CPE course from this document for a CPA's continuing education records.
Rules:
- Include only courses that are completed AND award CPE credit. Skip in-progress courses, courses with no credits, and non-CPE credits (e.g. PMI PDUs).
- hours = CPE credits as printed (e.g. 2.5).
- field_of_study must be one of the allowed NASBA fields. Map close wording (e.g. "Accounting and Auditing" → pick the best single field; "Tax" → "Taxes"; "Ethics" → "Regulatory Ethics" unless it says behavioral). If no field is printed, make your best guess from the course title and set field_confident=false.
- delivery_method: map "Live"/"Group Live" → "Group Live", "Group Internet Based"/"Webinar"/"Virtual live" → "Group Internet Based", "QAS Self Study"/"Self-study" → "QAS Self Study".
- Dates must be YYYY-MM-DD. Use null for anything not shown.`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function publishableKey() {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
    return keys.default ?? Object.values(keys)[0] ?? Deno.env.get("SUPABASE_ANON_KEY");
  } catch {
    return Deno.env.get("SUPABASE_ANON_KEY");
  }
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return json({ ok: true });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, publishableKey()!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error: userErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (userErr || !user) return json({ error: "Not signed in." }, 401);

    const { path } = await req.json();
    if (typeof path !== "string" || !path.startsWith(`${user.id}/`)) return json({ error: "Invalid file." }, 400);

    // Download with the user's own permissions: storage rules only allow their own folder.
    const { data: file, error: dlErr } = await supabase.storage.from("certificates").download(path);
    if (dlErr || !file) return json({ error: "Couldn't open the uploaded file." }, 404);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > 20 * 1024 * 1024) return json({ error: "File is too large (max 20 MB)." }, 413);
    const isPdf = path.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
    const mediaType = isPdf ? "application/pdf" : (file.type?.startsWith("image/") ? file.type : "image/jpeg");
    const block = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: encodeBase64(bytes) } }
      : { type: "image", source: { type: "base64", media_type: mediaType, data: encodeBase64(bytes) } };

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "Certificate reading isn't configured yet." }, 500);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{ role: "user", content: [block, { type: "text", text: PROMPT }] }],
      }),
    });
    if (!res.ok) {
      console.error("Anthropic error", res.status, await res.text());
      return json({ error: "The certificate reader is unavailable right now." }, 502);
    }
    const msg = await res.json();
    const out = msg.content?.find((c: { type: string }) => c.type === "tool_use")?.input;
    if (!out) return json({ error: "Couldn't read this certificate." }, 422);
    if (!out.is_cpe_document || !out.courses?.length) {
      return json({ error: "This doesn't look like a CPE certificate, or it has no completed CPE courses." }, 422);
    }
    return json({ courses: out.courses });
  } catch (e) {
    console.error(e);
    return json({ error: "Something went wrong reading the certificate." }, 500);
  }
});
