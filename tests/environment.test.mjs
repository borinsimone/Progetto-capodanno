import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePublicEnv } from "../scripts/validate-public-env.mjs";
const url = "https://example.supabase.co";
const jwt = (role) =>
  "header." +
  Buffer.from(JSON.stringify({ role })).toString("base64url") +
  ".signature";
test("la build impedisce di incorporare segreti nel frontend", () => {
  assert.doesNotThrow(() => validatePublicEnv({}));
  assert.doesNotThrow(() =>
    validatePublicEnv({
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
    })
  );
  assert.doesNotThrow(() =>
    validatePublicEnv({
      VITE_SUPABASE_URL: url,
      VITE_SUPABASE_PUBLISHABLE_KEY: jwt("anon"),
    })
  );
  for (const key of [
    "sb_secret_example",
    jwt("service_role"),
    "database-password",
  ])
    assert.throws(() =>
      validatePublicEnv({
        VITE_SUPABASE_URL: url,
        VITE_SUPABASE_PUBLISHABLE_KEY: key,
      })
    );
  assert.throws(() =>
    validatePublicEnv({ VITE_GOOGLE_CLIENT_SECRET: "secret" })
  );
  assert.throws(() => validatePublicEnv({ VITE_SUPABASE_URL: url }));
  assert.throws(() =>
    validatePublicEnv({
      VITE_SUPABASE_URL: "http://example.com",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
    })
  );
});
