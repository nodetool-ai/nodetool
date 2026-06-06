/**
 * @jest-environment node
 */

let mockIsProduction = false;
jest.mock("../../../lib/env", () => ({
  get isProduction() {
    return mockIsProduction;
  }
}));

import { getAboutSidebarSections } from "../aboutSidebarUtils";

describe("getAboutSidebarSections", () => {
  beforeEach(() => {
    mockIsProduction = false;
  });

  it("returns two sections", () => {
    const sections = getAboutSidebarSections();
    expect(sections).toHaveLength(2);
    expect(sections[0].category).toBe("Application");
    expect(sections[1].category).toBe("Resources");
  });

  it("Application section contains expected items", () => {
    const sections = getAboutSidebarSections();
    const app = sections[0];
    const ids = app.items.map((i) => i.id);
    expect(ids).toContain("application");
    expect(ids).toContain("operating-system");
    expect(ids).toContain("features");
  });

  it("Resources section contains links", () => {
    const sections = getAboutSidebarSections();
    const resources = sections[1];
    const ids = resources.items.map((i) => i.id);
    expect(ids).toContain("links");
  });

  it("includes installation-paths in dev mode", () => {
    mockIsProduction = false;
    const sections = getAboutSidebarSections();
    const resources = sections[1];
    const ids = resources.items.map((i) => i.id);
    expect(ids).toContain("installation-paths");
  });

  it("excludes installation-paths in production mode", () => {
    mockIsProduction = true;
    const sections = getAboutSidebarSections();
    const resources = sections[1];
    const ids = resources.items.map((i) => i.id);
    expect(ids).not.toContain("installation-paths");
  });
});
