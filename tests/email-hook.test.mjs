import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Webhook } from "standardwebhooks";
import {
  createEmailHook,
  deliveryErrorCode,
} from "../supabase/functions/send-auth-email/handler.mjs";

test("EmailJS riceve solo OTP firmati da Supabase; firme errate, alterazioni e richieste scadute non inviano email", async () => {
  const secret = randomBytes(32).toString("base64");
  const webhook = new Webhook(secret);
  const config = {
    hookSecret: secret,
    serviceId: "test-service",
    templateId: "test-template",
    publicKey: "public",
    privateKey: "private-test",
  };
  const deliveries = [];
  const handler = createEmailHook({
    config,
    verify: (raw, headers) => webhook.verify(raw, headers),
    fetcher: async (url, options) => {
      deliveries.push({ url, body: JSON.parse(options.body) });
      return new Response("OK");
    },
  });
  const payload = JSON.stringify({
    user: { email: "member@example.com" },
    email_data: { email_action_type: "magiclink", token: "123456" },
  });
  function request(body = payload, date = new Date(), signedBody = body) {
    const id = "msg_test";
    return new Request("https://example.com/hook", {
      method: "POST",
      body,
      headers: {
        "content-type": "application/json",
        "webhook-id": id,
        "webhook-timestamp": String(Math.floor(date.getTime() / 1000)),
        "webhook-signature": webhook.sign(id, date, signedBody),
      },
    });
  }
  assert.equal((await handler(request())).status, 200);
  assert.equal(deliveries.length, 1);
  assert.deepEqual(deliveries[0].body.template_params, {
    to_email: "member@example.com",
    email: "member@example.com",
    otp_code: "123456",
    app_name: "Mezzanotte",
  });
  assert.equal(
    (
      await handler(
        new Request("https://example.com/hook", {
          method: "POST",
          body: payload,
        })
      )
    ).status,
    401
  );
  assert.equal(
    (
      await handler(
        request(
          payload.replace("member@example.com", "attacker@example.com"),
          new Date(),
          payload
        )
      )
    ).status,
    401
  );
  assert.equal(
    (await handler(request(payload, new Date(Date.now() - 600000)))).status,
    401
  );
  assert.equal(
    (await handler(request(payload.replace("123456", "not-an-otp")))).status,
    400
  );
  assert.equal(deliveries.length, 1);
});
test("provider non configurato e risposte di errore non espongono OTP o credenziali", async () => {
  const diagnostics = [];
  const missing = createEmailHook({
    config: {},
    verify: () => {
      throw new Error("must not run");
    },
  });
  assert.equal(
    (
      await missing(
        new Request("https://example.com", { method: "POST", body: "{}" })
      )
    ).status,
    503
  );
  const handler = createEmailHook({
    report: (event) => diagnostics.push(event),
    config: {
      hookSecret: "configured",
      serviceId: "service",
      templateId: "template",
      publicKey: "public",
      privateKey: "secret-value",
    },
    verify: () => ({
      user: { email: "member@example.com" },
      email_data: { email_action_type: "signup", token: "123456" },
    }),
    fetcher: async () =>
      new Response("secret-value and 123456", { status: 403 }),
  });
  const response = await handler(
    new Request("https://example.com", { method: "POST", body: "{}" })
  );
  assert.equal(response.status, 502);
  assert.doesNotMatch(
    await response.text(),
    /secret-value|123456|member@example/
  );
  assert.deepEqual(diagnostics, [
    { status: 403, code: "EMAILJS_DELIVERY_FAILED" },
  ]);
  assert.equal(
    deliveryErrorCode(
      404,
      "No records found. Public key: private-secret email: user@example.com code: 123456"
    ),
    "EMAILJS_CONFIGURATION_NOT_FOUND"
  );
  assert.equal(
    deliveryErrorCode(
      403,
      "API calls are disabled for non-browser applications"
    ),
    "EMAILJS_NON_BROWSER_DISABLED"
  );
});
