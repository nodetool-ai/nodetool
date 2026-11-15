import { dayPartFor, firstNameOf } from "../greeting";

describe("dayPartFor", () => {
  it.each([
    [0, "evening"],
    [4, "evening"],
    [5, "morning"],
    [11, "morning"],
    [12, "afternoon"],
    [17, "afternoon"],
    [18, "evening"],
    [23, "evening"]
  ])("hour %i is %s", (hour, part) => {
    expect(dayPartFor(hour)).toBe(part);
  });
});

describe("firstNameOf", () => {
  it("prefers the given name a Google sign-in stores", () => {
    expect(
      firstNameOf({
        user_metadata: { given_name: "Matthias", full_name: "Matthias Georgi" }
      })
    ).toBe("Matthias");
  });

  it("takes the first word of a full name", () => {
    expect(firstNameOf({ user_metadata: { full_name: "  Ada Lovelace " } })).toBe(
      "Ada"
    );
  });

  it("reads an SSO user's name", () => {
    expect(firstNameOf({ id: "sso", name: "Grace Hopper" })).toBe("Grace");
  });

  it("never makes a name from an email address", () => {
    expect(firstNameOf({ id: "u", email: "someone@example.com" })).toBeNull();
  });

  it("returns null with no user or no name", () => {
    expect(firstNameOf(null)).toBeNull();
    expect(firstNameOf({ id: "1", user_metadata: { name: "   " } })).toBeNull();
  });
});
