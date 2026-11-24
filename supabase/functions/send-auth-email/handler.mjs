export function createEmailHook({ verify, config, fetcher = fetch }) {
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
      // Provider responses may contain personal information: do not return or log their body.
      if (!response.ok) return reply(502, "Email delivery failed");
      return reply(200);
    } catch {
      return reply(502, "Email delivery failed");
    }
  };
}
