const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-signature",
  "access-control-allow-methods": "POST, OPTIONS"
};

const packs = [
  { id: "starter", credits: 50, variantId: Deno.env.get("LEMONSQUEEZY_VARIANT_STARTER") || "" },
  { id: "reader", credits: 150, variantId: Deno.env.get("LEMONSQUEEZY_VARIANT_READER") || "" },
  { id: "power", credits: 400, variantId: Deno.env.get("LEMONSQUEEZY_VARIANT_POWER") || "" }
];

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ ok: false, message: "Method not allowed" }, 405);
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-signature") || "";
  const secret = Deno.env.get("LEMONSQUEEZY_WEBHOOK_SECRET") || "";
  if (!await verifySignature(rawBody, signature, secret)) {
    return json({ ok: false, message: "Invalid signature" }, 401);
  }

  const event = JSON.parse(rawBody || "{}");
  const parsed = parseEvent(event);
  if (!parsed.installId || !parsed.orderId || !parsed.pack || parsed.credits <= 0) {
    return json({ ok: true, ignored: true }, 202);
  }

  const rpcName = parsed.eventName === "order_refunded"
    ? "refund_purchased_credits"
    : parsed.eventName === "order_created"
      ? "grant_purchased_credits"
      : "";

  if (!rpcName) {
    return json({ ok: true, ignored: true }, 202);
  }

  const args = rpcName === "grant_purchased_credits"
    ? {
      p_user_key: `install:${normalizeUserId(parsed.installId)}`,
      p_install_id: parsed.installId,
      p_email: parsed.email || null,
      p_lemon_order_id: parsed.orderId,
      p_lemon_event_id: parsed.eventId || null,
      p_variant_id: parsed.variantId,
      p_pack: parsed.pack.id,
      p_credits: parsed.credits
    }
    : {
      p_user_key: `install:${normalizeUserId(parsed.installId)}`,
      p_lemon_order_id: parsed.orderId,
      p_lemon_event_id: parsed.eventId || null,
      p_credits: parsed.credits
    };

  const result = await callRpc(rpcName, args);
  return json({ ok: true, result });
});

async function callRpc(name: string, body: Record<string, unknown>) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      "apikey": serviceRoleKey,
      "authorization": `Bearer ${serviceRoleKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase RPC failed (${response.status}): ${text.slice(0, 240)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function verifySignature(rawBody: string, signature: string, secret: string) {
  if (!signature || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return toHex(digest) === signature.toLowerCase();
}

function parseEvent(event: any) {
  const attributes = event?.data?.attributes || {};
  const meta = event?.meta || {};
  const custom = meta.custom_data || attributes.custom_data || attributes.checkout_data?.custom || {};
  const variantId = String(attributes.first_order_item?.variant_id || attributes.variant_id || custom.variant_id || "");
  const pack = packs.find((item) => item.variantId === variantId) || packs.find((item) => item.id === custom.pack);
  return {
    eventId: String(meta.event_id || event?.id || ""),
    eventName: String(meta.event_name || attributes.event_name || ""),
    orderId: String(event?.data?.id || attributes.order_id || attributes.identifier || ""),
    variantId,
    pack,
    credits: Number(custom.credits || pack?.credits || 0),
    installId: String(custom.install_id || "").trim(),
    email: String(attributes.user_email || attributes.email || custom.email || "").trim()
  };
}

function normalizeUserId(value: string) {
  return String(value || "anonymous").trim().toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "") || "anonymous";
}

function toHex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8"
    }
  });
}
