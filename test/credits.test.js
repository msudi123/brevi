import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  availableCreditPacks,
  createLemonCheckout,
  packForId,
  packForVariantId,
  parseLemonOrderEvent,
  verifyLemonSignature
} from "../api/_lib/credits.js";

const config = {
  lemonSqueezyVariantStarter: "101",
  lemonSqueezyVariantReader: "202",
  lemonSqueezyVariantPower: "303"
};

test("credit packs expose configured variants", () => {
  const packs = availableCreditPacks(config);
  assert.deepEqual(packs.map((pack) => [pack.id, pack.credits, pack.available]), [
    ["starter", 50, true],
    ["reader", 150, true],
    ["power", 400, true]
  ]);
});

test("pack lookup supports pack IDs and Lemon variant IDs", () => {
  assert.equal(packForId("reader").credits, 150);
  assert.equal(packForVariantId("303", config).id, "power");
  assert.equal(packForVariantId("404", config), null);
});

test("webhook signature verification accepts valid HMAC and rejects invalid signatures", () => {
  const rawBody = JSON.stringify({ ok: true });
  const secret = "webhook-secret";
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
  assert.equal(verifyLemonSignature(rawBody, signature, secret), true);
  assert.equal(verifyLemonSignature(rawBody, "00", secret), false);
});

test("parseLemonOrderEvent reads custom install data and maps credits", () => {
  const event = {
    data: {
      id: "order_123",
      attributes: {
        user_email: "reader@example.com",
        first_order_item: {
          variant_id: 202
        }
      }
    },
    meta: {
      event_id: "evt_123",
      event_name: "order_created",
      custom_data: {
        install_id: "install-abc",
        pack: "reader"
      }
    }
  };

  const parsed = parseLemonOrderEvent(event, config);
  assert.equal(parsed.eventId, "evt_123");
  assert.equal(parsed.eventName, "order_created");
  assert.equal(parsed.orderId, "order_123");
  assert.equal(parsed.installId, "install-abc");
  assert.equal(parsed.email, "reader@example.com");
  assert.equal(parsed.pack.id, "reader");
  assert.equal(parsed.credits, 150);
});

test("createLemonCheckout constrains custom checkout to the selected variant", async () => {
  const previousFetch = global.fetch;
  let payload;

  try {
    global.fetch = async (url, options) => {
      payload = JSON.parse(options.body);
      return {
        ok: true,
        async json() {
          return {
            data: {
              attributes: {
                url: "https://example.lemonsqueezy.com/checkout/custom/test"
              }
            }
          };
        }
      };
    };

    await createLemonCheckout({
      pack: packForId("starter"),
      installId: "install-abc",
      email: "reader@example.com",
      config: {
        ...config,
        lemonSqueezyApiKey: "api-key",
        lemonSqueezyStoreId: "123",
        publicAppUrl: "https://brevi.example"
      }
    });

    assert.deepEqual(payload.data.attributes.product_options.enabled_variants, [101]);
    assert.equal(payload.data.attributes.checkout_data.email, "reader@example.com");
    assert.equal(payload.data.attributes.checkout_data.custom.email, "reader@example.com");
    assert.equal("dark" in payload.data.attributes.checkout_options, false);
  } finally {
    global.fetch = previousFetch;
  }
});
