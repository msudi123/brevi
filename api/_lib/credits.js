import { createHmac, timingSafeEqual } from "node:crypto";
import { userKeyForIdentity } from "./supabase.js";

export const CREDIT_PACKS = [
  { id: "starter", name: "Starter", credits: 50, configKey: "lemonSqueezyVariantStarter" },
  { id: "reader", name: "Reader", credits: 150, configKey: "lemonSqueezyVariantReader" },
  { id: "power", name: "Power", credits: 400, configKey: "lemonSqueezyVariantPower" }
];

export function availableCreditPacks(config) {
  return CREDIT_PACKS.map((pack) => ({
    id: pack.id,
    name: pack.name,
    credits: pack.credits,
    available: Boolean(config[pack.configKey])
  }));
}

export function packForId(packId) {
  return CREDIT_PACKS.find((pack) => pack.id === String(packId || "").toLowerCase()) || null;
}

export function packForVariantId(variantId, config) {
  const normalized = String(variantId || "");
  return CREDIT_PACKS.find((pack) => String(config[pack.configKey] || "") === normalized) || null;
}

export async function createLemonCheckout({ pack, authUserId, installId, email, config }) {
  if (!config.lemonSqueezyApiKey || !config.lemonSqueezyStoreId) {
    throw new Error("Lemon Squeezy is not configured.");
  }

  const variantId = config[pack.configKey];
  if (!variantId) {
    throw new Error(`${pack.name} credits are not configured.`);
  }

  const appUrl = config.publicAppUrl || "https://brevi-psi.vercel.app";
  const userKey = userKeyForIdentity({ authUserId, installId });
  const numericVariantId = Number(variantId);
  const enabledVariantId = Number.isFinite(numericVariantId) ? numericVariantId : variantId;
  const payload = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_data: {
          email: email || undefined,
          custom: {
            auth_user_id: authUserId || "",
            install_id: installId,
            user_key: userKey,
            email: email || "",
            pack: pack.id,
            credits: String(pack.credits)
          }
        },
        checkout_options: {
          embed: false,
          media: false,
          logo: true,
          desc: true,
          discount: true,
          subscription_preview: false,
          button_color: "#14B8A6"
        },
        product_options: {
          enabled_variants: [enabledVariantId],
          redirect_url: `${appUrl}/api/credits/confirm?pack=${encodeURIComponent(pack.id)}`,
          receipt_button_text: "Return to Brevi",
          receipt_link_url: appUrl,
          receipt_thank_you_note: "Your Brevi credits are ready on this browser."
        },
        test_mode: Boolean(config.lemonSqueezyTestMode)
      },
      relationships: {
        store: {
          data: { type: "stores", id: String(config.lemonSqueezyStoreId) }
        },
        variant: {
          data: { type: "variants", id: String(variantId) }
        }
      }
    }
  };

  const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      "accept": "application/vnd.api+json",
      "authorization": `Bearer ${config.lemonSqueezyApiKey}`,
      "content-type": "application/vnd.api+json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.errors?.[0]?.detail || data?.message || "Lemon Squeezy checkout failed.";
    throw new Error(detail);
  }

  return {
    checkoutUrl: data?.data?.attributes?.url,
    payload
  };
}

export function verifyLemonSignature(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expected = Buffer.from(digest, "hex");
  const actual = Buffer.from(String(signature), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function parseLemonOrderEvent(event, config) {
  const attributes = event?.data?.attributes || {};
  const meta = event?.meta || {};
  const custom = meta.custom_data || attributes.custom_data || attributes.checkout_data?.custom || {};
  const orderId = String(event?.data?.id || attributes.order_id || attributes.identifier || "");
  const eventName = String(meta.event_name || attributes.event_name || "");
  const variantId = String(attributes.first_order_item?.variant_id || attributes.variant_id || custom.variant_id || "");
  const pack = packForVariantId(variantId, config) || packForId(custom.pack);
  const credits = Number(custom.credits || pack?.credits || 0);
  const authUserId = String(custom.auth_user_id || custom.authUserId || "").trim();

  return {
    eventId: String(meta.event_id || event?.id || ""),
    eventName,
    orderId,
    variantId,
    pack,
    credits,
    authUserId,
    installId: String(custom.install_id || "").trim(),
    email: String(attributes.user_email || attributes.email || custom.email || "").trim()
  };
}
