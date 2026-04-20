import { createLogger } from "@nodetool/config";
import type {
  FeedbackAttachment,
  FeedbackDestination,
  FeedbackSubmission
} from "../feedback-api.js";
import type {
  FeedbackServiceAdapters,
  FeedbackServiceConfig,
  FeedbackServiceDependencies
} from "./feedback-service.js";

const log = createLogger("nodetool.websocket.feedback");

function isEnabled(value: string | undefined): boolean {
  if (value == null) {
    return true;
  }

  return !["0", "false", "off", "no"].includes(value.toLowerCase());
}

function parseDestinations(value: string | undefined): FeedbackDestination[] {
  if (!value) {
    return ["email"];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(
      (item): item is FeedbackDestination =>
        item === "discord" || item === "email"
    );
}

function buildFeedbackSummary(submission: FeedbackSubmission): string {
  const destinationLine = submission.destinations.join(", ");
  return [
    `Username: ${submission.username}`,
    `Type: ${submission.feedbackType}`,
    `Requested destinations: ${destinationLine}`,
    submission.userId ? `User ID: ${submission.userId}` : null,
    "",
    submission.message
  ]
    .filter(Boolean)
    .join("\n");
}

function buildThreadName(submission: FeedbackSubmission): string {
  const prefix = submission.feedbackType === "bug" ? "Bug" : "Feature";
  const preview = submission.message.replace(/\s+/g, " ").trim().slice(0, 72);
  return `${prefix}: ${submission.username} - ${preview}`.slice(0, 100);
}

function buildDeliveryAttachments(
  submission: FeedbackSubmission
): FeedbackAttachment[] {
  const attachments = [...submission.attachments];
  if (submission.workflowJson) {
    attachments.push({
      filename: "workflow.json",
      contentType: "application/json",
      size: submission.workflowJson.length,
      data: new TextEncoder().encode(submission.workflowJson)
    });
  }

  return attachments;
}

export function getFeedbackServiceConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): FeedbackServiceConfig & { defaultDestinations: FeedbackDestination[] } {
  const discordEnabled =
    isEnabled(env["NODETOOL_FEEDBACK_DISCORD_ENABLED"]) &&
    Boolean(
      env["NODETOOL_FEEDBACK_DISCORD_BOT_TOKEN"] &&
        env["NODETOOL_FEEDBACK_DISCORD_FORUM_CHANNEL_ID"]
    );
  const emailEnabled =
    isEnabled(env["NODETOOL_FEEDBACK_EMAIL_ENABLED"]) &&
    Boolean(
      env["NODETOOL_FEEDBACK_EMAIL_SMTP_HOST"] &&
        env["NODETOOL_FEEDBACK_EMAIL_FROM"] &&
        env["NODETOOL_FEEDBACK_EMAIL_TO"]
    );

  return {
    defaultDestinations: parseDestinations(
      env["NODETOOL_FEEDBACK_DEFAULT_DESTINATIONS"]
    ),
    discord: {
      enabled: discordEnabled,
      botToken: env["NODETOOL_FEEDBACK_DISCORD_BOT_TOKEN"],
      forumChannelId: env["NODETOOL_FEEDBACK_DISCORD_FORUM_CHANNEL_ID"],
      tagId: env["NODETOOL_FEEDBACK_DISCORD_TAG_ID"]
    },
    email: {
      enabled: emailEnabled,
      smtpHost: env["NODETOOL_FEEDBACK_EMAIL_SMTP_HOST"],
      smtpPort: env["NODETOOL_FEEDBACK_EMAIL_SMTP_PORT"]
        ? Number(env["NODETOOL_FEEDBACK_EMAIL_SMTP_PORT"])
        : 587,
      smtpSecure: env["NODETOOL_FEEDBACK_EMAIL_SMTP_SECURE"] === "true",
      smtpUser: env["NODETOOL_FEEDBACK_EMAIL_SMTP_USER"],
      smtpPass: env["NODETOOL_FEEDBACK_EMAIL_SMTP_PASS"],
      from: env["NODETOOL_FEEDBACK_EMAIL_FROM"],
      to: env["NODETOOL_FEEDBACK_EMAIL_TO"]
    }
  };
}

export async function sendDiscordFeedback(
  submission: FeedbackSubmission,
  config: FeedbackServiceConfig["discord"]
): Promise<void> {
  if (!config.enabled || !config.botToken || !config.forumChannelId) {
    throw new Error("Discord feedback destination is not configured");
  }

  const attachments = buildDeliveryAttachments(submission);
  const payload = {
    name: buildThreadName(submission),
    applied_tags: config.tagId ? [config.tagId] : undefined,
    message: {
      content: buildFeedbackSummary(submission),
      attachments: attachments.map((attachment, index) => ({
        id: index,
        filename: attachment.filename
      }))
    }
  };

  const url = `https://discord.com/api/v10/channels/${config.forumChannelId}/threads`;
  const headers = {
    Authorization: `Bot ${config.botToken}`
  };

  const response =
    attachments.length === 0
      ? await fetch(url, {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        })
      : await (async () => {
          const formData = new FormData();
          formData.set("payload_json", JSON.stringify(payload));
          attachments.forEach((attachment, index) => {
            formData.append(
              `files[${index}]`,
              new File([attachment.data], attachment.filename, {
                type: attachment.contentType
              })
            );
          });

          return fetch(url, {
            method: "POST",
            headers,
            body: formData
          });
        })();

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Discord feedback delivery failed (${response.status}): ${body || response.statusText}`
    );
  }
}

export async function sendEmailFeedback(
  submission: FeedbackSubmission,
  config: FeedbackServiceConfig["email"]
): Promise<void> {
  if (!config.enabled || !config.smtpHost || !config.from || !config.to) {
    throw new Error("Email feedback destination is not configured");
  }

  const nodemailer = (await import("nodemailer")).default;
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort ?? 587,
    secure: config.smtpSecure ?? false,
    auth: config.smtpUser
      ? {
          user: config.smtpUser,
          pass: config.smtpPass ?? ""
        }
      : undefined
  });

  const attachments = buildDeliveryAttachments(submission).map((attachment) => ({
    filename: attachment.filename,
    contentType: attachment.contentType,
    content: Buffer.from(attachment.data)
  }));

  await transporter.sendMail({
    from: config.from,
    to: config.to,
    subject: `[NodeTool Feedback][${submission.feedbackType}] ${submission.username}`,
    text: buildFeedbackSummary(submission),
    attachments
  });
}

export function createFeedbackServiceDependenciesFromEnv(
  env: NodeJS.ProcessEnv = process.env
): FeedbackServiceDependencies {
  const config = getFeedbackServiceConfigFromEnv(env);
  const adapters: FeedbackServiceAdapters = {
    sendDiscordFeedback: async (submission) => {
      await sendDiscordFeedback(submission, config.discord);
    },
    sendEmailFeedback: async (submission) => {
      await sendEmailFeedback(submission, config.email);
    }
  };

  return { config, adapters };
}

export function logFeedbackFailure(error: unknown): void {
  log.error(
    "Feedback delivery failed",
    error instanceof Error ? error : new Error(String(error))
  );
}
