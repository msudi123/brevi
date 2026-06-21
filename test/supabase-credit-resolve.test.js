import test from "node:test";
import assert from "node:assert/strict";
import { getCreditAccount, resolveCreditUserKey } from "../api/_lib/supabase.js";

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

test("getCreditAccount falls back to email-linked balances when merge RPC fails", async () => {
  const previousFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const target = String(url);

    if (target.includes("/credit_accounts?on_conflict=user_key")) {
      return {
        ok: true,
        status: 201,
        async text() {
          return "";
        }
      };
    }

    if (target.includes("/rpc/merge_credit_accounts_by_email")) {
      return {
        ok: false,
        status: 400,
        async text() {
          return JSON.stringify({ message: "column reference \"balance\" is ambiguous" });
        }
      };
    }

    if (target.includes("user_key=in.")) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify([
            { user_key: "auth:user-abc", balance: 0 },
            { user_key: "install:install-abc", balance: 0 }
          ]);
        }
      };
    }

    if (target.includes("email_hash=eq.")) {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify([
            { user_key: "install:old-install-1", balance: 50 },
            { user_key: "install:old-install-2", balance: 100 }
          ]);
        }
      };
    }

    throw new Error(`Unexpected fetch: ${target} ${options.method || "GET"}`);
  };

  try {
    const account = await getCreditAccount({
      authUserId: "user-abc",
      installId: "install-abc",
      email: "reader@example.com",
      config
    });
    assert.equal(account.userKey, "auth:user-abc");
    assert.equal(account.balance, 150);
  } finally {
    global.fetch = previousFetch;
  }
});
