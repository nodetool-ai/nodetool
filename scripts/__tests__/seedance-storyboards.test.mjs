/**
 * The Seedance boards ship through EXAMPLE_STORYBOARDS once their stills are
 * rendered. These checks keep each one in the shipped board shape and keep its
 * Seedance prompt in step with its shots.
 */
import { describe, expect, it } from "vitest";

import { CURATED_STORYBOARDS } from "../example-storyboards/boards.mjs";
import {
  SEEDANCE_STORYBOARDS,
  seedancePrompt
} from "../example-storyboards/seedance-boards.mjs";

describe("seedance storyboards", () => {
  it("finds boards to inspect", () => {
    expect(SEEDANCE_STORYBOARDS.length).toBeGreaterThan(0);
  });

  it("uses slugs no shipped board or other Seedance board has", () => {
    const slugs = [...CURATED_STORYBOARDS, ...SEEDANCE_STORYBOARDS].map((b) => b.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each(SEEDANCE_STORYBOARDS)("$slug has the shipped board shape", (board) => {
    for (const key of ["name", "description", "brief", "style", "aspectRatio"]) {
      expect(board[key], key).toBeTruthy();
    }
    expect(board.cast.length).toBeGreaterThan(0);
    expect(board.shots.length).toBeGreaterThanOrEqual(4);
    const shotSlugs = board.shots.map((shot) => shot.slug);
    expect(new Set(shotSlugs).size).toBe(shotSlugs.length);
    for (const shot of board.shots) {
      expect(shot.action, shot.slug).toBeTruthy();
      expect(shot.motion, shot.slug).toMatch(/^[a-z-]+$/);
      expect(shot.camera.framing, shot.slug).toBeTruthy();
      expect(shot.camera.movement, shot.slug).toBeTruthy();
      expect(shot.beat, shot.slug).toBeTruthy();
      expect(Number.isInteger(shot.durationSeconds), shot.slug).toBe(true);
    }
  });

  it.each(SEEDANCE_STORYBOARDS)("$slug fits one Seedance 2.0 generation", (board) => {
    const total = board.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0);
    expect(total).toBeGreaterThanOrEqual(4);
    expect(total).toBeLessThanOrEqual(15);
  });

  it.each(SEEDANCE_STORYBOARDS)("$slug prompt numbers every shot in order", (board) => {
    const prompt = seedancePrompt(board);
    const shotLines = prompt.split("\n").filter((line) => line.startsWith("Shot "));
    expect(shotLines).toHaveLength(board.shots.length);
    let start = 0;
    board.shots.forEach((shot, index) => {
      const end = start + shot.durationSeconds;
      expect(shotLines[index]).toContain(`Shot ${index + 1} [${start}-${end}s]:`);
      if (shot.dialogue) expect(shotLines[index]).toContain(`"${shot.dialogue}"`);
      start = end;
    });
    expect(seedancePrompt(board, { timecodes: false })).not.toMatch(/\[\d+-\d+s\]/);
  });
});
