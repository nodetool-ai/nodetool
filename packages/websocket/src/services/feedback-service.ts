import type {
  FeedbackDestination,
  FeedbackSubmission
} from "../feedback-api.js";

export interface FeedbackServiceConfig {
  discord: {
    enabled: boolean;
    botToken?: string;
    forumChannelId?: string;
    tagId?: string;
  };
  email: {
    enabled: boolean;
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
    smtpUser?: string;
    smtpPass?: string;
    from?: string;
    to?: string;
  };
}

export interface FeedbackServiceAdapters {
  sendDiscordFeedback: (submission: FeedbackSubmission) => Promise<void>;
  sendEmailFeedback: (submission: FeedbackSubmission) => Promise<void>;
}

export interface FeedbackServiceDependencies {
  config: FeedbackServiceConfig;
  adapters: FeedbackServiceAdapters;
}

function getEnabledDestinations(
  requested: FeedbackDestination[],
  config: FeedbackServiceConfig
): FeedbackDestination[] {
  return requested.filter((destination) => {
    if (destination === "discord") {
      return config.discord.enabled;
    }

    return config.email.enabled;
  });
}

export async function submitFeedback(
  submission: FeedbackSubmission,
  dependencies: FeedbackServiceDependencies
): Promise<{ deliveredTo: FeedbackDestination[] }> {
  const enabledDestinations = getEnabledDestinations(
    submission.destinations,
    dependencies.config
  );

  if (enabledDestinations.length === 0) {
    throw new Error("No feedback destinations are configured");
  }

  for (const destination of enabledDestinations) {
    if (destination === "discord") {
      await dependencies.adapters.sendDiscordFeedback(submission);
      continue;
    }

    await dependencies.adapters.sendEmailFeedback(submission);
  }

  return { deliveredTo: enabledDestinations };
}
