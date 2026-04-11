import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";

const TWILIO_TIMEOUT = 30000;

/**
 * Build Basic Auth header for Twilio API.
 */
function twilioAuthHeader(sid: string, token: string): string {
  return `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;
}

// ---------------------------------------------------------------------------
// Send SMS
// ---------------------------------------------------------------------------

export class TwilioSendSMSLibNode extends BaseNode {
  static readonly nodeType = "lib.twilio.SendSMS";
  static readonly title = "Send SMS";
  static readonly description =
    "Send an SMS message via the Twilio REST API.\n    twilio, sms, text, send, message\n\n    Use cases:\n    - Send notification texts\n    - Automate SMS alerts\n    - Send verification codes";
  static readonly metadataOutputTypes = {
    output: "dict"
  };
  static readonly exposeAsTool = true;
  static readonly requiredSettings = [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN"
  ];

  @prop({
    type: "str",
    default: "",
    title: "To",
    description: "Recipient phone number in E.164 format (e.g. +15551234567)"
  })
  declare to: any;

  @prop({
    type: "str",
    default: "",
    title: "From Number",
    description:
      "Twilio phone number to send from in E.164 format (e.g. +15559876543)"
  })
  declare from_number: any;

  @prop({
    type: "str",
    default: "",
    title: "Body",
    description: "The text content of the SMS message"
  })
  declare body: any;

  @prop({
    type: "str",
    default: "",
    title: "Account SID",
    description:
      "Twilio Account SID (optional — falls back to TWILIO_ACCOUNT_SID secret)"
  })
  declare account_sid: any;

  @prop({
    type: "str",
    default: "",
    title: "Auth Token",
    description:
      "Twilio Auth Token (optional — falls back to TWILIO_AUTH_TOKEN secret)"
  })
  declare auth_token: any;

  async process(): Promise<Record<string, unknown>> {
    const to = String(this.to ?? "");
    const from = String(this.from_number ?? "");
    const body = String(this.body ?? "");
    const sid =
      String(this.account_sid ?? "") ||
      this._secrets["TWILIO_ACCOUNT_SID"] ||
      "";
    const token =
      String(this.auth_token ?? "") ||
      this._secrets["TWILIO_AUTH_TOKEN"] ||
      "";

    if (!to) throw new Error("Recipient phone number (to) is required");
    if (!from) throw new Error("Sender phone number (from_number) is required");
    if (!body) throw new Error("Message body is required");
    if (!sid) throw new Error("Twilio Account SID is required");
    if (!token) throw new Error("Twilio Auth Token is required");

    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
    const params = new URLSearchParams({ To: to, From: from, Body: body });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TWILIO_TIMEOUT);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: twilioAuthHeader(sid, token),
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params.toString(),
        signal: controller.signal
      });

      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        const msg =
          (json as Record<string, unknown>).message ?? res.statusText;
        throw new Error(`Twilio API error (${res.status}): ${msg}`);
      }

      return {
        output: {
          sid: json.sid,
          status: json.status,
          date_created: json.date_created
        }
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---------------------------------------------------------------------------
// Send WhatsApp
// ---------------------------------------------------------------------------

export class TwilioSendWhatsAppLibNode extends BaseNode {
  static readonly nodeType = "lib.twilio.SendWhatsApp";
  static readonly title = "Send WhatsApp";
  static readonly description =
    "Send a WhatsApp message via the Twilio REST API.\n    twilio, whatsapp, message, send\n\n    Use cases:\n    - Send WhatsApp notifications\n    - Automate WhatsApp customer messages\n    - Send rich media via WhatsApp";
  static readonly metadataOutputTypes = {
    output: "dict"
  };
  static readonly exposeAsTool = true;
  static readonly requiredSettings = [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN"
  ];

  @prop({
    type: "str",
    default: "",
    title: "To",
    description: "Recipient phone number in E.164 format (e.g. +15551234567)"
  })
  declare to: any;

  @prop({
    type: "str",
    default: "",
    title: "From Number",
    description:
      "Twilio WhatsApp-enabled phone number in E.164 format (e.g. +15559876543)"
  })
  declare from_number: any;

  @prop({
    type: "str",
    default: "",
    title: "Body",
    description: "The text content of the WhatsApp message"
  })
  declare body: any;

  @prop({
    type: "str",
    default: "",
    title: "Account SID",
    description:
      "Twilio Account SID (optional — falls back to TWILIO_ACCOUNT_SID secret)"
  })
  declare account_sid: any;

  @prop({
    type: "str",
    default: "",
    title: "Auth Token",
    description:
      "Twilio Auth Token (optional — falls back to TWILIO_AUTH_TOKEN secret)"
  })
  declare auth_token: any;

  async process(): Promise<Record<string, unknown>> {
    const to = String(this.to ?? "");
    const from = String(this.from_number ?? "");
    const body = String(this.body ?? "");
    const sid =
      String(this.account_sid ?? "") ||
      this._secrets["TWILIO_ACCOUNT_SID"] ||
      "";
    const token =
      String(this.auth_token ?? "") ||
      this._secrets["TWILIO_AUTH_TOKEN"] ||
      "";

    if (!to) throw new Error("Recipient phone number (to) is required");
    if (!from) throw new Error("Sender phone number (from_number) is required");
    if (!body) throw new Error("Message body is required");
    if (!sid) throw new Error("Twilio Account SID is required");
    if (!token) throw new Error("Twilio Auth Token is required");

    const whatsappTo = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
    const whatsappFrom = from.startsWith("whatsapp:")
      ? from
      : `whatsapp:${from}`;

    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`;
    const params = new URLSearchParams({
      To: whatsappTo,
      From: whatsappFrom,
      Body: body
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TWILIO_TIMEOUT);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: twilioAuthHeader(sid, token),
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params.toString(),
        signal: controller.signal
      });

      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        const msg =
          (json as Record<string, unknown>).message ?? res.statusText;
        throw new Error(`Twilio API error (${res.status}): ${msg}`);
      }

      return {
        output: {
          sid: json.sid,
          status: json.status,
          date_created: json.date_created
        }
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

// ---------------------------------------------------------------------------
// Get Messages
// ---------------------------------------------------------------------------

export class TwilioGetMessagesLibNode extends BaseNode {
  static readonly nodeType = "lib.twilio.GetMessages";
  static readonly title = "Get Messages";
  static readonly description =
    "List recent SMS/MMS messages from a Twilio account.\n    twilio, sms, messages, list, history\n\n    Use cases:\n    - Retrieve message history\n    - Monitor incoming messages\n    - Audit sent messages";
  static readonly metadataOutputTypes = {
    message: "dict",
    messages: "list"
  };
  static readonly exposeAsTool = true;
  static readonly isStreamingOutput = true;
  static readonly requiredSettings = [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN"
  ];

  @prop({
    type: "int",
    default: 20,
    title: "Limit",
    description: "Maximum number of messages to return (1-1000)"
  })
  declare limit: any;

  @prop({
    type: "str",
    default: "",
    title: "To",
    description: "Filter by recipient phone number"
  })
  declare to: any;

  @prop({
    type: "str",
    default: "",
    title: "From Number",
    description: "Filter by sender phone number"
  })
  declare from_number: any;

  @prop({
    type: "str",
    default: "",
    title: "Date Sent",
    description: "Filter by date sent (YYYY-MM-DD)"
  })
  declare date_sent: any;

  @prop({
    type: "str",
    default: "",
    title: "Account SID",
    description:
      "Twilio Account SID (optional — falls back to TWILIO_ACCOUNT_SID secret)"
  })
  declare account_sid: any;

  @prop({
    type: "str",
    default: "",
    title: "Auth Token",
    description:
      "Twilio Auth Token (optional — falls back to TWILIO_AUTH_TOKEN secret)"
  })
  declare auth_token: any;

  private async _fetchMessages(): Promise<Array<Record<string, unknown>>> {
    const sid =
      String(this.account_sid ?? "") ||
      this._secrets["TWILIO_ACCOUNT_SID"] ||
      "";
    const token =
      String(this.auth_token ?? "") ||
      this._secrets["TWILIO_AUTH_TOKEN"] ||
      "";

    if (!sid) throw new Error("Twilio Account SID is required");
    if (!token) throw new Error("Twilio Auth Token is required");

    const limit = Math.max(1, Math.min(1000, Number(this.limit ?? 20)));
    const queryParams = new URLSearchParams({
      PageSize: String(limit)
    });

    const to = String(this.to ?? "");
    if (to) queryParams.set("To", to);

    const from = String(this.from_number ?? "");
    if (from) queryParams.set("From", from);

    const dateSent = String(this.date_sent ?? "");
    if (dateSent) queryParams.set("DateSent", dateSent);

    const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json?${queryParams.toString()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TWILIO_TIMEOUT);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: twilioAuthHeader(sid, token)
        },
        signal: controller.signal
      });

      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        const msg =
          (json as Record<string, unknown>).message ?? res.statusText;
        throw new Error(`Twilio API error (${res.status}): ${msg}`);
      }

      const rawMessages = (json.messages ?? []) as Array<
        Record<string, unknown>
      >;
      return rawMessages.map((m) => ({
        sid: m.sid,
        to: m.to,
        from: m.from,
        body: m.body,
        status: m.status,
        direction: m.direction,
        date_created: m.date_created,
        date_sent: m.date_sent,
        price: m.price,
        price_unit: m.price_unit
      }));
    } finally {
      clearTimeout(timer);
    }
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const messages = await this._fetchMessages();

    for (const message of messages) {
      yield { message };
    }

    yield { messages };
  }

  async process(): Promise<Record<string, unknown>> {
    const messages = await this._fetchMessages();
    return {
      message: messages[0] ?? {},
      messages
    };
  }
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export class TwilioLookupLibNode extends BaseNode {
  static readonly nodeType = "lib.twilio.Lookup";
  static readonly title = "Lookup Phone Number";
  static readonly description =
    "Look up phone number information using the Twilio Lookup API.\n    twilio, phone, lookup, carrier, number\n\n    Use cases:\n    - Validate phone numbers\n    - Get carrier information\n    - Determine phone number type (mobile, landline)";
  static readonly metadataOutputTypes = {
    output: "dict"
  };
  static readonly exposeAsTool = true;
  static readonly requiredSettings = [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN"
  ];

  @prop({
    type: "str",
    default: "",
    title: "Phone Number",
    description: "Phone number to look up in E.164 format (e.g. +15551234567)"
  })
  declare phone_number: any;

  @prop({
    type: "str",
    default: "",
    title: "Account SID",
    description:
      "Twilio Account SID (optional — falls back to TWILIO_ACCOUNT_SID secret)"
  })
  declare account_sid: any;

  @prop({
    type: "str",
    default: "",
    title: "Auth Token",
    description:
      "Twilio Auth Token (optional — falls back to TWILIO_AUTH_TOKEN secret)"
  })
  declare auth_token: any;

  async process(): Promise<Record<string, unknown>> {
    const phoneNumber = String(this.phone_number ?? "");
    const sid =
      String(this.account_sid ?? "") ||
      this._secrets["TWILIO_ACCOUNT_SID"] ||
      "";
    const token =
      String(this.auth_token ?? "") ||
      this._secrets["TWILIO_AUTH_TOKEN"] ||
      "";

    if (!phoneNumber) throw new Error("Phone number is required");
    if (!sid) throw new Error("Twilio Account SID is required");
    if (!token) throw new Error("Twilio Auth Token is required");

    const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(phoneNumber)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TWILIO_TIMEOUT);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: twilioAuthHeader(sid, token)
        },
        signal: controller.signal
      });

      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        const msg =
          (json as Record<string, unknown>).message ?? res.statusText;
        throw new Error(`Twilio Lookup API error (${res.status}): ${msg}`);
      }

      return {
        output: {
          phone_number: json.phone_number ?? phoneNumber,
          country_code: json.country_code,
          national_format: json.national_format,
          valid: json.valid,
          validation_errors: json.validation_errors,
          caller_name: json.caller_name,
          carrier: json.line_type_intelligence,
          calling_country_code: json.calling_country_code,
          url: json.url
        }
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export const LIB_TWILIO_NODES: readonly NodeClass[] = [
  TwilioSendSMSLibNode,
  TwilioSendWhatsAppLibNode,
  TwilioGetMessagesLibNode,
  TwilioLookupLibNode
] as const;
