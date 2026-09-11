import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  TUTORIAL_CATALOG,
  inspectionFrames,
  posterFrame
} from "../tutorialCatalog";
import { validateShots } from "../camera";
import {
  framesForTiming,
  presentationToCastTime,
  validateTimeMap
} from "../tutorialTiming";

test("every app tutorial has shots, inspection frames, and a settled poster before its outro", () => {
  const appCatalog = readFileSync(
    new URL(
      "../../../web/src/components/tutorials/tutorialsData.ts",
      import.meta.url
    ),
    "utf8"
  );
  const ids = Array.from(
    appCatalog.matchAll(/id: "([^"]+)"/g),
    (match) => match[1]
  );
  assert.ok(ids.length > 0, "the app catalog must be inspected");
  assert.deepEqual(
    TUTORIAL_CATALOG.map((entry) => entry.slug).sort(),
    ids.sort()
  );
  for (const entry of TUTORIAL_CATALOG) {
    const { props } = entry;
    assert.ok(
      props.shots && props.shots.length > 1,
      `${entry.slug}: authored shots`
    );
    assert.deepEqual(validateShots(props.shots), [], entry.slug);
    assert.deepEqual(validateTimeMap(props.timeMap ?? []), [], entry.slug);
    assert.equal(
      props.shots[0].target.kind,
      "overview",
      `${entry.slug}: establishing shot`
    );
    assert.equal(
      props.shots.at(-1)?.toMs,
      props.replayWindowMs,
      `${entry.slug}: result reaches closing card`
    );
    for (const shot of props.shots) {
      if (shot.actionAtMs !== undefined) {
        assert.ok(
          shot.actionAtMs >= shot.fromMs + (shot.moveMs ?? 650) + 200,
          `${entry.slug}/${shot.id}: arrive and settle before the action`
        );
      }
    }
    const frames = inspectionFrames(entry);
    assert.ok(
      frames.length >= props.shots.length * 4,
      `${entry.slug}: transitions are inspected`
    );
    const totalFrames = framesForTiming(entry.fps, props);
    for (const { frame } of frames) {
      assert.ok(
        frame >= 0 && frame < totalFrames,
        `${entry.slug}: frame ${frame}`
      );
    }
    const poster = posterFrame(entry);
    assert.ok(poster > props.introSeconds * entry.fps);
    assert.ok(
      poster < (props.introSeconds + props.replayWindowMs / 1000) * entry.fps
    );
    for (const caption of props.captions) {
      const words = caption.text.trim().split(/\s+/).length;
      const budget = (words / 3) * 1000 + 250;
      assert.ok(
        caption.toMs - caption.fromMs >= budget,
        `${entry.slug}: caption needs ${Math.ceil(budget)} ms: ${caption.text}`
      );
    }
  }
});

test("graph results match their cast event and remain readable after appearing", () => {
  const expectedResults = new Map([
    ["first-workflow", { castMs: 15500, holdMs: 2000 }],
    ["connect-run", { castMs: 6000, holdMs: 2000 }],
    ["list-generator", { castMs: 12500, holdMs: 2500 }],
    ["ask-ai", { castMs: 11300, holdMs: 2500 }],
    ["combine-inputs", { castMs: 6700, holdMs: 2000 }],
    ["summarize-text", { castMs: 11300, holdMs: 3000 }],
    ["describe-image", { castMs: 11700, holdMs: 3000 }]
  ]);

  for (const entry of TUTORIAL_CATALOG) {
    const expected = expectedResults.get(entry.slug);
    if (!expected) continue;
    const resultShot = entry.props.shots?.find(
      (shot) => shot.emphasis === "outline" && shot.actionAtMs !== undefined
    );
    assert.ok(resultShot, `${entry.slug}: authored result shot`);
    const mappedCastMs = presentationToCastTime(
      resultShot.actionAtMs as number,
      entry.props.timeMap
    );
    assert.ok(
      Math.abs(mappedCastMs - expected.castMs) <= 2,
      `${entry.slug}: result action maps to the recorded cast event`
    );
    assert.ok(
      resultShot.toMs - (resultShot.actionAtMs as number) >= expected.holdMs,
      `${entry.slug}: result remains focused for ${expected.holdMs}ms`
    );
    assert.ok(
      (resultShot.maxZoom ?? 0) >= 2.5,
      `${entry.slug}: result is readable at embedded size`
    );
  }
  assert.equal(expectedResults.size, 7, "all graph tutorials are audited");
});

test("timeline actions map to the cast events they describe", () => {
  const tutorial = TUTORIAL_CATALOG.find(
    (entry) => entry.slug === "timeline-trim-arrange"
  );
  assert.ok(tutorial);
  const shots = tutorial.props.shots;
  assert.ok(shots);
  const expectedCastTimes = [600, 2200, 3600, 5800, 7200, 7600];
  const actualCastTimes = shots
    .filter((shot) => shot.actionAtMs !== undefined)
    .map((shot) =>
      presentationToCastTime(shot.actionAtMs as number, tutorial.props.timeMap)
    );
  assert.equal(actualCastTimes.length, expectedCastTimes.length);
  actualCastTimes.forEach((actual, index) => {
    assert.ok(
      Math.abs(actual - expectedCastTimes[index]) <= 20,
      `action ${index + 1}: mapped ${actual}ms, expected ${expectedCastTimes[index]}ms`
    );
  });
});

test("JS code changes and test verdicts retain readable holds after their real cast events", () => {
  const readings = [
    ["jsscript-assistant", "code-body", 9000, 6000],
    ["jsscript-assistant", "saved-test", 13600, 4000],
    ["jsscript-repair", "failing-result", 7000, 5000],
    ["jsscript-repair", "repaired-code", 14000, 5000],
    ["jsscript-repair", "passing-rerun", 16800, 4000]
  ] as const;
  for (const [slug, shotId, castEvent, minimumHold] of readings) {
    const entry = TUTORIAL_CATALOG.find((entry) => entry.slug === slug);
    const shot = entry?.props.shots?.find((shot) => shot.id === shotId);
    assert.ok(entry && shot && shot.actionAtMs !== undefined, `${slug}/${shotId}`);
    assert.equal(presentationToCastTime(shot.actionAtMs, entry.props.timeMap), castEvent);
    assert.ok(shot.toMs - shot.actionAtMs >= minimumHold, `${slug}/${shotId}: readable result hold`);
  }
});
