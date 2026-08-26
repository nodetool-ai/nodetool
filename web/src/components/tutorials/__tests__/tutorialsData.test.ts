import { existsSync } from "fs";
import { join } from "path";

import { TUTORIALS, getTutorial } from "../tutorialsData";
import type { Tutorial } from "../tutorialsData";

/** The docs site serves these; the repo checks them in under `docs/assets`. */
const DOCS_ASSETS = "https://docs.nodetool.ai/assets/tutorials/";

/** Where a tutorial URL resolves to in this repo. */
const repoPath = (url: string) =>
  join(__dirname, "../../../../../docs/assets/tutorials", url.slice(DOCS_ASSETS.length));

describe("tutorialsData", () => {
  describe("TUTORIALS", () => {
    it("is a non-empty array", () => {
      expect(TUTORIALS.length).toBeGreaterThan(0);
    });

    it("every entry has all required fields", () => {
      const requiredKeys: (keyof Tutorial)[] = [
        "id",
        "title",
        "tagline",
        "description",
        "level",
        "durationLabel",
        "video",
        "poster",
        "accent",
        "learn"
      ];
      for (const tutorial of TUTORIALS) {
        for (const key of requiredKeys) {
          expect(tutorial).toHaveProperty(key);
        }
      }
    });

    it("every id is unique", () => {
      const ids = TUTORIALS.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("every learn array is non-empty", () => {
      for (const tutorial of TUTORIALS) {
        expect(tutorial.learn.length).toBeGreaterThan(0);
      }
    });

    it("every video is served from the docs site, not the app bundle", () => {
      for (const tutorial of TUTORIALS) {
        expect(tutorial.video.startsWith(DOCS_ASSETS)).toBe(true);
      }
    });

    it("every poster is served from the docs site, not the app bundle", () => {
      for (const tutorial of TUTORIALS) {
        expect(tutorial.poster.startsWith(DOCS_ASSETS)).toBe(true);
      }
    });

    it("every accent is a valid hex color", () => {
      for (const tutorial of TUTORIALS) {
        expect(tutorial.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });

    it("every durationLabel matches M:SS format", () => {
      for (const tutorial of TUTORIALS) {
        expect(tutorial.durationLabel).toMatch(/^\d+:\d{2}$/);
      }
    });

    it("every video and poster is checked in under docs/assets/tutorials", () => {
      const missing = TUTORIALS.flatMap((t) =>
        [t.video, t.poster].filter((url) => !existsSync(repoPath(url)))
      );
      expect(missing).toEqual([]);
    });
  });

  describe("getTutorial", () => {
    it("returns the matching tutorial by id", () => {
      const first = TUTORIALS[0];
      const result = getTutorial(first.id);
      expect(result).toBe(first);
    });

    it("returns the last tutorial when it exists", () => {
      const last = TUTORIALS[TUTORIALS.length - 1];
      const result = getTutorial(last.id);
      expect(result).toBe(last);
    });

    it("falls back to the first tutorial for an unknown id", () => {
      const result = getTutorial("nonexistent-tutorial-id");
      expect(result).toBe(TUTORIALS[0]);
    });

    it("falls back to the first tutorial when id is null", () => {
      const result = getTutorial(null);
      expect(result).toBe(TUTORIALS[0]);
    });

    it("falls back to the first tutorial when id is undefined", () => {
      const result = getTutorial(undefined);
      expect(result).toBe(TUTORIALS[0]);
    });
  });
});
