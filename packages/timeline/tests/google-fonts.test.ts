import { describe, expect, it } from "vitest";

import {
  assertGoogleFontsUrlAllowed,
  collectFontFaceRequests,
  collectUnresolvedFontFamilies,
  googleFontsFaceUrl,
  googleFontsLicenseName,
  googleFontsLicenseUrl,
  googleFontsMetadataUrl,
  googleFontsSlug,
  parseGoogleFontsMetadata,
  pickGoogleFontFile
} from "../src/fonts/google-fonts.js";
import type { TimelineSequence } from "../src/types.js";

describe("googleFontsSlug", () => {
  it("lowercases and drops everything but letters and digits", () => {
    expect(googleFontsSlug("Space Grotesk")).toBe("spacegrotesk");
    expect(googleFontsSlug("IBM Plex Sans")).toBe("ibmplexsans");
    expect(googleFontsSlug("Noto Sans JP")).toBe("notosansjp");
  });
});

describe("URL builders", () => {
  it("build stable raw.githubusercontent.com URLs", () => {
    expect(googleFontsMetadataUrl("ofl", "poppins")).toBe(
      "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/METADATA.pb"
    );
    expect(googleFontsFaceUrl("ofl", "poppins", "Poppins[wght].ttf")).toBe(
      "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins%5Bwght%5D.ttf"
    );
    expect(googleFontsLicenseUrl("apache", "roboto")).toBe(
      "https://raw.githubusercontent.com/google/fonts/main/apache/roboto/LICENSE.txt"
    );
    expect(googleFontsLicenseUrl("ofl", "poppins")).toBe(
      "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/OFL.txt"
    );
  });

  it("names the SPDX-ish licence per directory", () => {
    expect(googleFontsLicenseName("ofl")).toBe("OFL-1.1");
    expect(googleFontsLicenseName("apache")).toBe("Apache-2.0");
  });
});

describe("assertGoogleFontsUrlAllowed", () => {
  it("passes the one trusted host", () => {
    expect(() =>
      assertGoogleFontsUrlAllowed(googleFontsMetadataUrl("ofl", "poppins"))
    ).not.toThrow();
  });

  it("refuses every other host, including a lookalike", () => {
    expect(() =>
      assertGoogleFontsUrlAllowed("https://raw.githubusercontent.com.evil.example/x")
    ).toThrow(/refusing/);
    expect(() =>
      assertGoogleFontsUrlAllowed("https://fonts.googleapis.com/css2?family=Poppins")
    ).toThrow(/refusing/);
    expect(() =>
      assertGoogleFontsUrlAllowed("http://169.254.169.254/latest/meta-data/")
    ).toThrow(/refusing/);
  });
});

const SPACE_GROTESK_METADATA = `
name: "Space Grotesk"
designer: "Florian Karsten"
license: "OFL"
category: "SANS_SERIF"
fonts {
  name: "Space Grotesk"
  style: "normal"
  weight: 300
  filename: "SpaceGrotesk[wght].ttf"
}
fonts {
  name: "Space Grotesk"
  style: "normal"
  weight: 700
  filename: "SpaceGrotesk[wght].ttf"
}
fonts {
  name: "Space Grotesk"
  style: "italic"
  weight: 400
  filename: "SpaceGrotesk-Italic.ttf"
}
subsets: "latin"
`;

describe("parseGoogleFontsMetadata", () => {
  it("reads a long run of unclosed blocks in linear time", () => {
    const hostile = "fonts{" + "fonts{|".repeat(50000);
    const started = performance.now();
    expect(parseGoogleFontsMetadata(hostile).faces).toEqual([]);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("reads the family name and every fonts{} block", () => {
    const metadata = parseGoogleFontsMetadata(SPACE_GROTESK_METADATA);
    expect(metadata.name).toBe("Space Grotesk");
    expect(metadata.faces).toEqual([
      { style: "normal", weight: 300, filename: "SpaceGrotesk[wght].ttf" },
      { style: "normal", weight: 700, filename: "SpaceGrotesk[wght].ttf" },
      { style: "italic", weight: 400, filename: "SpaceGrotesk-Italic.ttf" }
    ]);
  });

  it("skips a block missing a required field and finds nothing in empty text", () => {
    expect(parseGoogleFontsMetadata("").faces).toEqual([]);
    expect(
      parseGoogleFontsMetadata('fonts { style: "normal" weight: 400 }').faces
    ).toEqual([]);
  });
});

describe("pickGoogleFontFile", () => {
  const metadata = parseGoogleFontsMetadata(SPACE_GROTESK_METADATA);

  it("prefers the requested style and nearest weight, reporting the file's full range", () => {
    const bold = pickGoogleFontFile(metadata, { weight: 650, style: "normal" });
    expect(bold).toEqual({
      filename: "SpaceGrotesk[wght].ttf",
      style: "normal",
      weights: [300, 700]
    });
  });

  it("falls back to any style when the family has none of the requested one", () => {
    const picked = pickGoogleFontFile(metadata, { weight: 400, style: "italic" });
    expect(picked?.filename).toBe("SpaceGrotesk-Italic.ttf");
    expect(picked?.style).toBe("italic");
  });

  it("returns null for a metadata with no faces", () => {
    expect(
      pickGoogleFontFile({ name: "Nothing", faces: [] }, { weight: 400, style: "normal" })
    ).toBeNull();
  });
});

function sequenceWithClips(
  clips: TimelineSequence["clips"]
): Pick<TimelineSequence, "clips"> {
  return { clips };
}

describe("collectFontFaceRequests", () => {
  it("ignores bundled families and dedupes by family+weight+style", () => {
    const sequence = sequenceWithClips([
      {
        id: "a",
        trackId: "t",
        name: "A",
        mediaType: "text",
        startMs: 0,
        durationMs: 1000,
        textStyle: {
          text: "Hello",
          fontFamily: "Poppins",
          fontSizePx: 48,
          fontWeight: 700,
          fontStyle: "italic",
          color: "#fff"
        }
      },
      {
        id: "b",
        trackId: "t",
        name: "B",
        mediaType: "text",
        startMs: 0,
        durationMs: 1000,
        textStyle: {
          text: "World",
          fontFamily: "Poppins",
          fontSizePx: 24,
          fontWeight: 700,
          fontStyle: "italic",
          color: "#fff"
        }
      },
      {
        id: "c",
        trackId: "t",
        name: "C",
        mediaType: "text",
        startMs: 0,
        durationMs: 1000,
        textStyle: { text: "Bundled", fontFamily: "Inter", fontSizePx: 24, color: "#fff" }
      },
      {
        id: "d",
        trackId: "t",
        name: "D",
        mediaType: "video",
        startMs: 0,
        durationMs: 1000,
        caption: {
          words: [],
          style: { fontFamily: "Poppins" }
        }
      }
    ] as unknown as TimelineSequence["clips"]);

    const requests = collectFontFaceRequests(sequence);
    expect(requests).toEqual([
      { family: "Poppins", weight: 700, style: "italic" },
      // A caption is drawn bold, so its face is requested at that weight.
      { family: "Poppins", weight: 700, style: "normal" }
    ]);
    expect(collectUnresolvedFontFamilies(sequence)).toEqual(["Poppins"]);
  });

  it("returns nothing for a sequence with no clips", () => {
    expect(collectFontFaceRequests(sequenceWithClips([]))).toEqual([]);
  });
});
