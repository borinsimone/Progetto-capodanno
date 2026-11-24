export function deliveryErrorCode(status, message) {
  if (/no records found/i.test(message))
    return "EMAILJS_CONFIGURATION_NOT_FOUND";
  if (/non.browser|browser.only/i.test(message))
    return "EMAILJS_NON_BROWSER_DISABLED";
  if (/private.key|access.token/i.test(message))
    return "EMAILJS_PRIVATE_KEY_REQUIRED";
  if (/quota|limit.*reach|rate.limit/i.test(message))
    return "EMAILJS_LIMIT_REACHED";
  if (/public.key|user.id/i.test(message)) return "EMAILJS_PUBLIC_KEY_INVALID";
  if (/template/i.test(message)) return "EMAILJS_TEMPLATE_ERROR";
  if (/service|gmail|authentication|credential|permission|scope/i.test(message))
    return "EMAILJS_SERVICE_ERROR";
  return status === 429 ? "EMAILJS_LIMIT_REACHED" : "EMAILJS_DELIVERY_FAILED";
}
export function createEmailHook({
  verify,
  config,
  fetcher = fetch,
  report = () => {},
}) {
  return async (request) => {
    const reply = (status, message) =>
      Response.json(message ? { error: { http_code: status, message } } : {}, {
        status,
      });
    if (request.method !== "POST") return reply(405, "Method not allowed");
    if (
      !config.hookSecret ||
      !config.serviceId ||
      !config.templateId ||
      !config.publicKey
    )
      return reply(503, "Email delivery is not configured");
    if (Number(request.headers.get("content-length") || 0) > 65536)
      return reply(413, "Request too large");
    let payload;
    try {
      const raw = await request.text();
      if (raw.length > 65536) return reply(413, "Request too large");
      payload = verify(raw, Object.fromEntries(request.headers));
    } catch {
      return reply(401, "Invalid webhook signature");
    }
    const { user, email_data: email } = payload || {};
    if (
      !user ||
      typeof user.email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email) ||
      !email ||
      !["signup", "magiclink"].includes(email.email_action_type) ||
      typeof email.token !== "string" ||
      !/^\d{6,10}$/.test(email.token)
    )
      return reply(400, "Unsupported auth email");
    // Only Supabase's signed, server-generated OTP is sent. Never accept a destination/code from browser input.
    const body = {
      service_id: config.serviceId,
      template_id: config.templateId,
      user_id: config.publicKey,
      template_params: {
        to_email: user.email,
        otp_code: email.token,
        app_name: "Mezzanotte",
      },
      ...(config.privateKey ? { accessToken: config.privateKey } : {}),
    };
    try {
      const response = await fetcher(
        "https://api.emailjs.com/api/v1.0/email/send",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(4000),
        }
      );
      // Only a fixed diagnostic code is logged. Never log or return the provider's raw response.
      if (!response.ok) {
        const code = deliveryErrorCode(response.status, await response.text());
        report({ status: response.status, code });
        return reply(502, "Email delivery failed");
      }
      return reply(200);
    } catch {
      report({ status: 0, code: "EMAILJS_NETWORK_ERROR" });
      return reply(502, "Email delivery failed");
    }
  };
}
