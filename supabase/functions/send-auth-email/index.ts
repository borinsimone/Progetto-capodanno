import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { createEmailHook } from "./handler.mjs";

const config = {
  hookSecret: Deno.env.get("SEND_EMAIL_HOOK_SECRET") || "",
  serviceId: Deno.env.get("EMAILJS_SERVICE_ID") || "",
  templateId: Deno.env.get("EMAILJS_TEMPLATE_ID") || "",
  publicKey: Deno.env.get("EMAILJS_PUBLIC_KEY") || "",
  privateKey: Deno.env.get("EMAILJS_PRIVATE_KEY") || "",
};
const secret = config.hookSecret
  .replace(/^v1,whsec_/, "")
  .replace(/^whsec_/, "");
const webhook = secret ? new Webhook(secret) : null;
Deno.serve(
  createEmailHook({
    config,
    report: (event: { status: number; code: string }) =>
      console.warn("Email delivery diagnostic", event),
    verify: (body: string, headers: Record<string, string>) => {
      if (!webhook) throw new Error("Hook unavailable");
      return webhook.verify(body, headers);
    },
  })
);
