import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";

import { TUTORIALS, getTutorial } from "../tutorialsData";
import type { Tutorial } from "../tutorialsData";

/** Videos stream from the docs site; the repo checks them in under `docs/`. */
const DOCS_ASSETS = "https://docs.nodetool.ai/assets/tutorials/";

const DOCS_DIR = join(__dirname, "../../../../../docs/assets/tutorials");
const PUBLIC_DIR = join(__dirname, "../../../../public/tutorials");

const videoPath = (url: string) => join(DOCS_DIR, url.slice(DOCS_ASSETS.length));
const posterPath = (path: string) =>
  join(PUBLIC_DIR, path.replace("/tutorials/", ""));

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

    // A poster renders the moment a page opens, so it cannot depend on another
    // site being deployed; a video is only fetched when someone presses play.
    it("every poster is served by the app itself", () => {
      for (const tutorial of TUTORIALS) {
        expect(tutorial.poster.startsWith("/tutorials/")).toBe(true);
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

    it("every video is checked in under docs/assets/tutorials", () => {
      const missing = TUTORIALS.map((t) => t.video).filter(
        (url) => !existsSync(videoPath(url))
      );
      expect(missing).toEqual([]);
    });

    it("every poster is checked in under web/public/tutorials", () => {
      const missing = TUTORIALS.map((t) => t.poster).filter(
        (path) => !existsSync(posterPath(path))
      );
      expect(missing).toEqual([]);
    });

    // The docs page renders the same posters. Two copies drift silently; a
    // byte comparison is the cheapest thing that notices.
    it("each poster is byte-identical to the docs site's copy", () => {
      const differing = TUTORIALS.map((t) => t.poster).filter((path) => {
        const file = path.replace("/tutorials/", "");
        return !readFileSync(posterPath(path)).equals(
          readFileSync(join(DOCS_DIR, file))
        );
      });
      expect(differing).toEqual([]);
    });

    it("the app bundle carries no tutorial video", () => {
      const videos = readdirSync(PUBLIC_DIR).filter((f) => f.endsWith(".mp4"));
      expect(videos).toEqual([]);
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
