import test from "node:test";
import assert from "node:assert/strict";
import { creditAccountKeysForIdentity, usageKeysForIdentity, userKeyFor, userKeyForIdentity } from "../api/_lib/supabase.js";

test("userKeyFor is install-scoped by default", () => {
  assert.equal(userKeyFor("Install-ABC"), "install:install-abc");
});

test("usageKeysForIdentity adds email/ip keys for guests", () => {
  const usageKeys = usageKeysForIdentity({
    installId: "install-123",
    email: "Reader@Example.com",
    ipAddress: "203.0.113.10"
  });

  assert.equal(usageKeys.primary, "install:install-123");
  assert.equal(usageKeys.keys.length, 3);
  assert.ok(usageKeys.keys.includes("install:install-123"));
  assert.ok(usageKeys.keys.some((key) => key.startsWith("email:")));
  assert.ok(usageKeys.keys.some((key) => key.startsWith("ip:")));
});

test("auth identities use auth keys and preserve install history", () => {
  const usageKeys = usageKeysForIdentity({
    authUserId: "user-abc",
    installId: "install-123",
    email: "reader@example.com",
    ipAddress: "203.0.113.10"
  });

  assert.equal(userKeyForIdentity({ authUserId: "user-abc", installId: "install-123" }), "auth:user-abc");
  assert.equal(usageKeys.primary, "auth:user-abc");
  assert.ok(usageKeys.keys.includes("auth:user-abc"));
  assert.ok(usageKeys.keys.includes("install:install-123"));
  assert.equal(creditAccountKeysForIdentity({ authUserId: "user-abc", installId: "install-123" }).length, 2);
});

test("changing email does not remove the install quota key", () => {
  const first = usageKeysForIdentity({
    installId: "install-123",
    email: "one@example.com",
    ipAddress: "203.0.113.10"
  });
  const second = usageKeysForIdentity({
    installId: "install-123",
    email: "two@example.com",
    ipAddress: "203.0.113.10"
  });

  assert.ok(first.keys.includes("install:install-123"));
  assert.ok(second.keys.includes("install:install-123"));
  assert.equal(first.primary, second.primary);
});
