/**
 * Turn a provider's own error into one sentence a creator can act on.
 *
 * A refused model call reaches the setup flow as whatever the provider wrote:
 * a status code, a JSON body, a billing URL, and — because the server appends
 * its own reading of the same failure — the whole thing twice. Shown raw under
 * a guided step it reads as a crash. The cases below are the ones a first run
 * actually hits; anything else keeps the provider's text, trimmed to one line,
 * because a message we do not recognise is still better than "something went
 * wrong".
 */

/** What went wrong, and what the creator can do about it. */
export interface DirectorFailure {
  message: string;
  /** The one thing to try next, or undefined when the message says it all. */
  hint?: string;
}

const firstSentence = (text: string): string => {
  // A provider body often carries a JSON blob; the words around it are the
  // part worth reading.
  const withoutJson = text.replace(/\{[\s\S]*\}/g, "").trim();
  const source = withoutJson.length > 0 ? withoutJson : text;
  // The server joins its own reading of the failure with an em dash; the
  // provider's half comes first and is the more specific one.
  const [providerHalf] = source.split(" — ");
  return providerHalf.replace(/\s+/g, " ").trim();
};

export function describeDirectorFailure(
  raw: string,
  model?: { id: string; provider: string } | null
): DirectorFailure {
  const named = model?.id ? `${model.provider}/${model.id}` : "This model";
  const text = raw.trim();

  if (/\b404\b|no longer available|does not exist|NOT_FOUND/i.test(text)) {
    return {
      message: `${named} is not available on your account.`,
      hint: "Pick another model below."
    };
  }
  if (/\b401\b|\b403\b|authentication|invalid[ _-]?api[ _-]?key|unauthorized/i.test(text)) {
    return {
      message: `Your ${model?.provider ?? "provider"} API key was refused.`,
      hint: "Check the key in Settings, or pick a model from another provider."
    };
  }
  if (/\b429\b|quota|credits|rate limit/i.test(text)) {
    return {
      message: `${named} is out of quota or rate limited.`,
      hint: "Wait and try again, or pick another model below."
    };
  }
  if (/\b5\d\d\b|timeout|timed out|ECONNRESET|network/i.test(text)) {
    return {
      message: `${named} did not answer.`,
      hint: "Try again."
    };
  }
  return { message: firstSentence(text) || "The Director run failed." };
}

/** The failure as one string, for a surface with no room for a second line. */
export const directorFailureText = (failure: DirectorFailure): string =>
  failure.hint ? `${failure.message} ${failure.hint}` : failure.message;
