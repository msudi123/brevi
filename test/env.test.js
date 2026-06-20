import assert from "node:assert/strict";
import test from "node:test";

import { getConfig } from "../api/_lib/env.js";

test("getConfig normalizes Vercel hostnames into public HTTPS URLs", () => {
  const previousPublicAppUrl = process.env.PUBLIC_APP_URL;
  const previousVercelUrl = process.env.VERCEL_URL;

  try {
    delete process.env.PUBLIC_APP_URL;
    process.env.VERCEL_URL = "brevi-psi.vercel.app";

    assert.equal(getConfig().publicAppUrl, "https://brevi-psi.vercel.app");
  } finally {
    if (previousPublicAppUrl === undefined) {
      delete process.env.PUBLIC_APP_URL;
    } else {
      process.env.PUBLIC_APP_URL = previousPublicAppUrl;
    }

    if (previousVercelUrl === undefined) {
      delete process.env.VERCEL_URL;
    } else {
      process.env.VERCEL_URL = previousVercelUrl;
    }
  }
});

test("getConfig includes the Supabase anon key when set", () => {
  const previousAnonKey = process.env.SUPABASE_ANON_KEY;

  try {
    process.env.SUPABASE_ANON_KEY = "anon-key";
    assert.equal(getConfig().supabaseAnonKey, "anon-key");
  } finally {
    if (previousAnonKey === undefined) {
      delete process.env.SUPABASE_ANON_KEY;
    } else {
      process.env.SUPABASE_ANON_KEY = previousAnonKey;
    }
  }
});
