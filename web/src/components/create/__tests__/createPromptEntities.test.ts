import {
  joinPromptEntities,
  splitPromptEntities
} from "../createPromptEntities";
import { promptWithEntities } from "../../projects/projectStarters";

describe("createPromptEntities", () => {
  it("shows the words without the token line Home adds", () => {
    const stored = promptWithEntities("Marta standing on a beach", [
      "entity-marta"
    ]);
    expect(splitPromptEntities(stored)).toEqual({
      text: "Marta standing on a beach",
      entityIds: ["entity-marta"]
    });
  });

  it("keeps the references while the words are edited, trailing space included", () => {
    const stored = joinPromptEntities("Marta on a beach ", [
      "entity-marta",
      "entity-harbor"
    ]);
    expect(stored).toBe(
      "Marta on a beach \n\nentity://entity-marta entity://entity-harbor"
    );
    expect(splitPromptEntities(stored)).toEqual({
      text: "Marta on a beach ",
      entityIds: ["entity-marta", "entity-harbor"]
    });
  });

  it("leaves a prompt without references unchanged", () => {
    expect(splitPromptEntities("a red bicycle\n\n")).toEqual({
      text: "a red bicycle\n\n",
      entityIds: []
    });
    expect(joinPromptEntities("a red bicycle", [])).toBe("a red bicycle");
  });

  it("takes a token typed inside the words out of the box", () => {
    expect(splitPromptEntities("entity://entity-marta on a beach")).toEqual({
      text: "on a beach",
      entityIds: ["entity-marta"]
    });
  });
});
