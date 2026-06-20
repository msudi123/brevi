import test from "node:test";
import assert from "node:assert/strict";
import { usageKeysFor, userKeyFor } from "../api/_lib/supabase.js";

test("userKeyFor is install-scoped by default", () => {
  assert.equal(userKeyFor("Install-ABC"), "install:install-abc");
});

test("usageKeysFor always includes install key and adds email/ip keys", () => {
  const usageKeys = usageKeysFor({
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

test("changing email does not remove the install quota key", () => {
  const first = usageKeysFor({
    installId: "install-123",
    email: "one@example.com",
    ipAddress: "203.0.113.10"
  });
  const second = usageKeysFor({
    installId: "install-123",
    email: "two@example.com",
    ipAddress: "203.0.113.10"
  });

  assert.ok(first.keys.includes("install:install-123"));
  assert.ok(second.keys.includes("install:install-123"));
  assert.equal(first.primary, second.primary);
});
