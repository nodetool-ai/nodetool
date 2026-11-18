/**
 * Checks for the native participant runner's desktop surface.
 *
 * The key and wheel translations run everywhere. The desktop test starts a
 * real Xvfb display with Openbox and drives ImageMagick's `display` window,
 * so it needs the tools in `DESKTOP_TOOLS`; it is skipped without them.
 *
 * Run (from web/): npx tsx --test tests/agentic-qa/desktopSession.test.ts
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import {
  checkDesktopTools,
  describeOpenRequest,
  DesktopSession,
  toXdotoolKey,
  wheelNotches
} from "./desktopSession";
import { prepareOutDir } from "./participantLoop";

const run = promisify(execFile);

test("keys use the browser runner's names", () => {
  assert.equal(toXdotoolKey("Enter"), "Return");
  assert.equal(toXdotoolKey("Backspace"), "BackSpace");
  assert.equal(toXdotoolKey("ArrowLeft"), "Left");
  assert.equal(toXdotoolKey("Control+A"), "ctrl+a");
  assert.equal(toXdotoolKey("Meta+Shift+Z"), "super+shift+z");
  assert.equal(toXdotoolKey("Alt+F4"), "alt+F4");
  assert.equal(toXdotoolKey("Control++"), "ctrl+plus");
  assert.equal(toXdotoolKey("+"), "plus");
  assert.equal(toXdotoolKey("PageDown"), "Page_Down");
  assert.equal(toXdotoolKey("A"), "A");
  assert.equal(toXdotoolKey("Shift"), "Shift_L");
  assert.throws(() => toXdotoolKey("Hyper+A"), /not a modifier/);
  assert.throws(() => toXdotoolKey("Launch"), /not a key/);
});

test("a wheel delta of 100 is one notch and any delta moves at least one", () => {
  assert.equal(wheelNotches(0), 0);
  assert.equal(wheelNotches(30), 1);
  assert.equal(wheelNotches(-100), 1);
  assert.equal(wheelNotches(450), 5);
});

test("an open request names only what a person would see", () => {
  assert.equal(
    describeOpenRequest("https://example.com/settings?token=abc"),
    "The app tried to open a web page (https://example.com) in a web browser. Web pages are outside this study, so it did not open."
  );
  assert.match(describeOpenRequest("file:///home/p/Documents/My%20notes.txt"), /“My notes\.txt” in another program/);
});

test("the desktop shows the app, reports its windows, and notices when it closes", async (t) => {
  const missing = await checkDesktopTools();
  if (missing.length > 0) {
    t.skip(`missing ${missing.join(", ")}`);
    return;
  }
  const work = await mkdtemp(join(tmpdir(), "desktop-session-test-"));
  const outDir = join(work, "out");
  await prepareOutDir(outDir);
  const picture = join(work, "picture.png");
  await run("convert", ["-size", "320x200", "xc:#2a6", picture]);

  const session = new DesktopSession({
    screen: { width: 800, height: 600 },
    window: "as-opened",
    // The app asks the desktop to open a web page once, as a link button would.
    launch: {
      command: "sh",
      args: ["-c", `xdg-open https://example.com/help; exec display -title "Test picture" ${picture}`],
      env: {}
    },
    assets: [{ name: "notes.txt", path: picture }],
    outDir
  });
  session.maxActions = 5;
  try {
    await session.start();
    const first = await session.receipt("Current view.");
    assert.match(first.receipt.text, /Open windows: 1 \(“Test picture”\)/);
    assert.match(first.receipt.text, /Active window: Test picture/);
    assert.match(first.receipt.text, /a web page \(https:\/\/example\.com\) in a web browser/);
    assert.equal(first.receipt.screenshot, "S001");
    const png = Buffer.from(first.data, "base64");
    assert.equal(png.readUInt32BE(16), 800, "the screenshot is the whole screen");
    assert.equal(png.readUInt32BE(20), 600);

    assert.deepEqual(await readdir(join(session.homeDir, "Documents")), ["notes.txt"]);

    const closed = await session.act("pressed Alt+F4", () => session.press("Alt+F4"));
    assert.match(closed.receipt.text, /A window closed: “Test picture”/);
    assert.match(closed.receipt.text, /The app closed\./);
    assert.match(closed.receipt.text, /`open_app` opens it again/);
    assert.match(closed.receipt.text, /Actions used: 1 of 5\./);

    const reopened = await session.act("opened the app", () => session.openApp());
    assert.match(reopened.receipt.text, /A new window opened: “Test picture”/);
    assert.doesNotMatch(reopened.receipt.text, /not running/);
  } finally {
    await session.close();
  }
  const events = (await readFile(join(outDir, "private", "desktop.jsonl"), "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { kind: string });
  assert.deepEqual(
    events.map((e) => e.kind),
    ["display", "app-launch", "open-request", "app-exit", "app-launch", "open-request"]
  );
});
