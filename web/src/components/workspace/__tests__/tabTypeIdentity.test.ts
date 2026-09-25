/**
 * @jest-environment jsdom
 */
import { PROJECT_GLYPH } from "../../projects/projectIdentity";
import {
  PROJECT_HOME_GLYPH,
  TYPE_GLYPH,
  tabDisplayTitle
} from "../tabTypeIdentity";

describe("tabDisplayTitle", () => {
  it("labels the project overview tab with the project name", () => {
    expect(
      tabDisplayTitle({ type: "project", title: "Marketing recipes" })
    ).toBe("Marketing recipes");
  });

  it("labels the editor landing surface Home", () => {
    expect(
      tabDisplayTitle({ type: "project-new", title: "Editor home" })
    ).toBe("Home");
  });

  it("keeps document tab titles unchanged", () => {
    expect(
      tabDisplayTitle({ type: "timeline", title: "The Next Tide" })
    ).toBe("The Next Tide");
  });
});

describe("TYPE_GLYPH", () => {
  it("does not reuse the project diamond on the Home tab", () => {
    expect(TYPE_GLYPH.project).toBe(PROJECT_HOME_GLYPH);
    expect(TYPE_GLYPH.project).not.toBe(PROJECT_GLYPH);
    expect(TYPE_GLYPH["project-list"]).toBe(PROJECT_GLYPH);
  });
});
