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

describe("tabDisplayTitle with a translation", () => {
  const translate = (key: string): string => `zh:${key}`;

  it("translates a page tab that keeps its default title", () => {
    expect(
      tabDisplayTitle({ type: "page", ref: "settings", title: "Settings" }, translate)
    ).toBe("zh:i18n-next51.page.titles.settings");
    expect(
      tabDisplayTitle({ type: "page", ref: "models", title: "Model manager" }, translate)
    ).toBe("zh:i18n-next51.page.titles.models");
  });

  it("translates the Home tab and an unnamed conversation", () => {
    expect(
      tabDisplayTitle({ type: "project-new", title: "Editor home" }, translate)
    ).toBe("zh:pass3_32.projects.home.homeTab");
    expect(
      tabDisplayTitle({ type: "chat", ref: "t1", title: "New conversation" }, translate)
    ).toBe("zh:i18n-next5.conversation.newConversation");
  });

  it("shows a title the user typed as stored", () => {
    expect(
      tabDisplayTitle({ type: "chat", ref: "t1", title: "月饼海报" }, translate)
    ).toBe("月饼海报");
    expect(
      tabDisplayTitle({ type: "page", ref: "settings", title: "我的设置" }, translate)
    ).toBe("我的设置");
  });
});

describe("TYPE_GLYPH", () => {
  it("does not reuse the project diamond on the Home tab", () => {
    expect(TYPE_GLYPH.project).toBe(PROJECT_HOME_GLYPH);
    expect(TYPE_GLYPH.project).not.toBe(PROJECT_GLYPH);
    expect(TYPE_GLYPH["project-list"]).toBe(PROJECT_GLYPH);
  });
});
