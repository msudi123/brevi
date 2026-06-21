import test from "node:test";
import assert from "node:assert/strict";
import { resolveCreditUserKey } from "../api/_lib/supabase.js";

const config = {
  supabaseUrl: "https://example.supabase.co",
  supabaseServiceRoleKey: "service-role-key"
};

test("resolveCreditUserKey prefers auth user id when provided", async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => {
    throw new Error("fetch should not be called when authUserId is present");
  };

  try {
    const userKey = await resolveCreditUserKey({
      authUserId: "d7b2ff31-3e4d-47a9-a9bd-af94c04b739c",
      installId: "install-abc",
      email: "reader@example.com",
      config
    });
    assert.equal(userKey, "auth:d7b2ff31-3e4d-47a9-a9bd-af94c04b739c");
  } finally {
    global.fetch = previousFetch;
  }
});

test("resolveCreditUserKey uses existing auth credit account for matching email", async () => {
  const previousFetch = global.fetch;
  global.fetch = async (url) => {
    assert.match(String(url), /credit_accounts\?email_hash=eq\./);
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify([
          { user_key: "install:old-install" },
          { user_key: "auth:user-abc" }
        ]);
      }
    };
  };

  try {
    const userKey = await resolveCreditUserKey({
      installId: "new-install",
      email: "reader@example.com",
      config
    });
    assert.equal(userKey, "auth:user-abc");
  } finally {
    global.fetch = previousFetch;
  }
});

test("resolveCreditUserKey falls back to install key when no auth match exists", async () => {
  const previousFetch = global.fetch;
  let callCount = 0;
  global.fetch = async (url) => {
    callCount += 1;
    if (String(url).includes("/credit_accounts")) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify([]);
        }
      };
    }
    if (String(url).includes("/auth/v1/admin/users")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return { users: [] };
        }
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const userKey = await resolveCreditUserKey({
      installId: "install-abc",
      email: "reader@example.com",
      config
    });
    assert.equal(userKey, "install:install-abc");
    assert.equal(callCount, 2);
  } finally {
    global.fetch = previousFetch;
  }
});
