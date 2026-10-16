import { describe, it, expect } from "@jest/globals";
import { emptyOutputMessage } from "../emptyOutputMessage";

describe("emptyOutputMessage", () => {
  it("says a finished run sent nothing", () => {
    expect(emptyOutputMessage("completed")).toBe(
      "The last run sent nothing here"
    );
  });

  it("asks for a run when none finished", () => {
    expect(emptyOutputMessage(undefined)).toBe("Run to see the output");
    expect(emptyOutputMessage("running")).toBe("Run to see the output");
  });
});
