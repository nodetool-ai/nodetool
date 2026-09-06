import {
  describeDirectorFailure,
  directorFailureText
} from "../providerError";

const MODEL = { id: "gpt-5-chat-latest", provider: "openai" };

it("names the model and points at the picker on a 404", () => {
  const failure = describeDirectorFailure(
    "404 The model `gpt-5-chat-latest` does not exist or you do not have access to it. — openai/gpt-5-chat-latest does not expose this model (404). Pick another model, or check that your openai account has access to it.",
    MODEL
  );
  expect(failure.message).toBe(
    "openai/gpt-5-chat-latest is not available on your account."
  );
  expect(failure.hint).toBe("Pick another model below.");
});

it("reads a quota refusal as quota, not as a missing model", () => {
  const failure = describeDirectorFailure(
    "429 You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/. — openai/gpt-5-mini is rate limiting or out of quota (429).",
    { id: "gpt-5-mini", provider: "openai" }
  );
  expect(failure.message).toBe(
    "openai/gpt-5-mini is out of quota or rate limited."
  );
});

it("names the provider on a rejected key", () => {
  const failure = describeDirectorFailure(
    '401 {"type":"error","error":{"type":"authentication_error","message":"API key is invalid."},"request_id":null}',
    { id: "claude-sonnet-4-5", provider: "anthropic" }
  );
  expect(failure.message).toBe("Your anthropic API key was refused.");
  expect(failure.hint).toContain("Settings");
});

// A model the provider retired answers 404 inside a JSON body, with no code
// in front of it.
it("reads a retired model out of a JSON body", () => {
  const failure = describeDirectorFailure(
    'Gemini API error 404: { "error": { "code": 404, "message": "This model models/gemini-2.5-flash is no longer available to new users.", "status": "NOT_FOUND" } }',
    { id: "gemini-2.5-flash", provider: "gemini" }
  );
  expect(failure.message).toBe(
    "gemini/gemini-2.5-flash is not available on your account."
  );
});

it("keeps an unrecognised failure, stripped to one line", () => {
  const failure = describeDirectorFailure(
    "The screenplay schema was rejected.\n{\"detail\": \"…\"}",
    MODEL
  );
  expect(failure.message).toBe("The screenplay schema was rejected.");
  expect(failure.hint).toBeUndefined();
});

it("joins the message and the hint for a one-line surface", () => {
  expect(
    directorFailureText({ message: "It broke.", hint: "Try again." })
  ).toBe("It broke. Try again.");
  expect(directorFailureText({ message: "It broke." })).toBe("It broke.");
});
