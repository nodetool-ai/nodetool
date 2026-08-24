/**
 * The marketing chat casts are the source of the screenshots on the site, and
 * a broken one shows up as a blank frame in a headless run rather than as an
 * error. These pin what a screenshot needs: a valid cast, events in order and
 * inside the timeline, and every embedded still actually on disk.
 */
import fs from "fs";
import path from "path";

import { chatCasts } from "../casts";
import { isChatDemoCast } from "../chatCastTypes";
import { marketingChatCasts } from "../marketing";

const PUBLIC_DIR = path.resolve(__dirname, "../../../../public");
const ASSET_REF = /\/demo-assets\/chat-marketing\/[\w.-]+/g;

describe("marketing chat casts", () => {
  it("are registered so the demo page and the shot script can find them", () => {
    for (const cast of marketingChatCasts) {
      expect(chatCasts).toContain(cast);
    }
    const ids = chatCasts.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(marketingChatCasts.map((c) => [c.id, c] as const))(
    "%s is a valid cast with an ordered timeline",
    (_id, cast) => {
      expect(isChatDemoCast(cast)).toBe(true);
      const times = cast.events.map((e) => e.t);
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(Math.max(...times)).toBeLessThanOrEqual(cast.durationMs);
    }
  );

  it.each(marketingChatCasts.map((c) => [c.id, c] as const))(
    "%s embeds only stills that exist",
    (_id, cast) => {
      const refs = new Set(JSON.stringify(cast).match(ASSET_REF) ?? []);
      // A cast with no embed would pass vacuously; the two that carry media
      // are the point of the screenshots, so assert the set is non-empty for
      // them and skip the ones that are prose only.
      for (const ref of refs) {
        expect(fs.existsSync(path.join(PUBLIC_DIR, ref))).toBe(true);
      }
    }
  );

  it("the storyboard and delivered casts embed media", () => {
    const embeds = (id: string) => {
      const cast = marketingChatCasts.find((c) => c.id === id);
      return (JSON.stringify(cast).match(ASSET_REF) ?? []).length;
    };
    expect(embeds("chat-storyboard-stills")).toBeGreaterThan(0);
    expect(embeds("chat-trailer-delivered")).toBeGreaterThan(0);
  });
});
