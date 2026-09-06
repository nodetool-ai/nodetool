/**
 * The genre catalog is data the flow, the Director prompt and the board chip
 * all read, so its shape is pinned here — and so is the rule that a card only
 * points at a still that exists on disk.
 */
import { existsSync } from "node:fs";
import path from "node:path";

import {
  SHIPPED_GENRE_STILLS,
  STORYBOARD_GENRES,
  genreByLabel,
  genreStill
} from "../genres";

/** Where the base-nodes package keeps the `package://nodetool-base` files. */
const ASSET_ROOT = path.resolve(
  __dirname,
  "../../../../../../packages/base-nodes/nodetool/assets/nodetool-base"
);

describe("storyboard genres", () => {
  it("offers the fourteen genres of PRD § 7.2", () => {
    expect(STORYBOARD_GENRES.map((genre) => genre.label)).toEqual([
      "Action",
      "Animation",
      "Comedy",
      "Commercial",
      "Documentary",
      "Drama",
      "Educational",
      "Fantasy",
      "Horror",
      "Music Video",
      "Mystery",
      "Romance",
      "Science Fiction",
      "Thriller"
    ]);
  });

  it("gives every genre a unique id, a line of copy and a still path", () => {
    const ids = STORYBOARD_GENRES.map((genre) => genre.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const genre of STORYBOARD_GENRES) {
      expect(genre.description.length).toBeGreaterThan(0);
      expect(genre.still).toBe(
        `package://nodetool-base/storyboards/genres/${genre.id}.jpg`
      );
    }
  });

  it("resolves a stored board.genre back to its card", () => {
    expect(genreByLabel("Science Fiction")?.id).toBe("science-fiction");
    expect(genreByLabel("")).toBeNull();
    expect(genreByLabel("Westerns")).toBeNull();
  });

  // A `package://` path with no file behind it resolves to a URL that 404s,
  // so the card would render a broken image. The registry is what keeps the
  // two in step, in both directions.
  it("only claims a still that is checked in", () => {
    for (const id of SHIPPED_GENRE_STILLS) {
      expect(STORYBOARD_GENRES.map((genre) => genre.id)).toContain(id);
      expect(
        existsSync(path.join(ASSET_ROOT, "storyboards", "genres", `${id}.jpg`))
      ).toBe(true);
    }
    for (const genre of STORYBOARD_GENRES) {
      const shipped = existsSync(
        path.join(ASSET_ROOT, "storyboards", "genres", `${genre.id}.jpg`)
      );
      expect(genreStill(genre)).toBe(shipped ? genre.still : undefined);
    }
  });

  it("reads the example board stills the same registry addresses", () => {
    // Proves the path above is the real asset root rather than a directory
    // that never existed, so the check cannot pass by finding nothing.
    expect(
      existsSync(
        path.join(ASSET_ROOT, "storyboards", "sneaker-drop", "sole-macro.jpg")
      )
    ).toBe(true);
  });
});
