/**
 * Generated tasks for the storyboard and script editors: plan a board or
 * write a script from a brief that names every shot or line, and edit an
 * existing board or script without disturbing what the request leaves out.
 *
 * Nothing here renders, voices, or calls a model: the checks read only the
 * document the headless bridge holds.
 */
import {
  createScriptToolBridge,
  createStoryboardToolBridge,
  type ScriptBridgeFinalState,
  type StoryboardBridgeFinalState
} from "@nodetool-ai/agents";
import {
  defineFamily,
  list,
  type Check,
  type ErasedFamily,
  type TaskFamily
} from "../task-families.js";

/** Case, spacing and quote style do not change what a line says. */
const sameText = (a: string | undefined, b: string): boolean => {
  const norm = (s: string) =>
    s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
  return norm(a ?? "") === norm(b);
};
const mentions = (text: string | undefined, key: string): boolean => (text ?? "").toLowerCase().includes(key.toLowerCase());

// ---------------------------------------------------------------- storyboard

interface ShotIdea {
  slug: string;
  /** A word the shot's action must mention. */
  key: string;
  action: string;
}

const SHOT_IDEAS: ShotIdea[] = [
  { slug: "Harbor at dawn", key: "harbor", action: "fishing boats leave a misty harbor at dawn" },
  { slug: "Market rush", key: "market", action: "a crowded street market with vendors calling out" },
  { slug: "Rooftop chase", key: "rooftop", action: "a courier sprints across a rooftop at night" },
  { slug: "Kitchen close-up", key: "pan", action: "butter melts in a hot pan, close up" },
  { slug: "Desert road", key: "desert", action: "a lone car drives down an empty desert road" },
  { slug: "Lab reveal", key: "lab", action: "a scientist lifts a cloth to reveal a glowing device in the lab" },
  { slug: "Forest trail", key: "forest", action: "two hikers climb a forest trail in light rain" },
  { slug: "Train window", key: "train", action: "rain streaks a train window as fields blur past" },
  { slug: "Concert crowd", key: "crowd", action: "a concert crowd raises their lights in the dark" },
  { slug: "Workshop", key: "workshop", action: "a carpenter planes a board in a dusty workshop" },
  { slug: "Snow cabin", key: "cabin", action: "smoke rises from a snowed-in cabin chimney" },
  { slug: "City timelapse", key: "skyline", action: "the city skyline turns from day to night" },
  { slug: "Coffee pour", key: "coffee", action: "coffee pours into a white cup on a wooden counter" },
  { slug: "Skate park", key: "skateboard", action: "a skater lands a trick on a skateboard at sunset" },
  { slug: "Library aisle", key: "library", action: "a student pulls an old book from a library shelf" },
  { slug: "Beach finale", key: "beach", action: "a family runs into the waves on a bright beach" }
];
const BOARD_TITLES = ["Morning Run", "The Delivery", "First Light", "Open Road", "Small Wins", "Homecoming", "Night Shift", "Field Notes"];

const shotAt = (s: StoryboardBridgeFinalState, slug: string) => s.shots.find((shot) => sameText(shot.slug, slug));
const indexOfSlug = (s: StoryboardBridgeFinalState, slug: string) => s.shots.findIndex((shot) => sameText(shot.slug, slug));

export const STORYBOARD_BUILD: TaskFamily<StoryboardBridgeFinalState> = {
  id: "storyboard-build",
  surface: "storyboard",
  make(pick) {
    const shots = pick.some(SHOT_IDEAS, pick.int(2, 5)).map((idea) => ({ ...idea, durationSeconds: pick.int(2, 8) }));
    // A title lives on the screenplay, so a titled board has to be loaded
    // as one; an untitled board can be built shot by shot.
    const title = pick.chance(0.4) ? pick.one(BOARD_TITLES) : null;
    const asks = shots.map((s, i) => `${i + 1}. "${s.slug}": ${s.action}, ${s.durationSeconds} seconds`);
    const checks: Check<StoryboardBridgeFinalState>[] = [
      { name: `board has ${shots.length} shots`, test: (s) => s.shots.length === shots.length },
      { name: "board would save", test: (s) => s.savable }
    ];
    shots.forEach((shot, i) => {
      checks.push(
        { name: `shot ${i} is "${shot.slug}"`, test: (s) => sameText(s.shots[i]?.slug, shot.slug) },
        { name: `"${shot.slug}" shows ${shot.key}`, test: (s) => mentions(shotAt(s, shot.slug)?.action, shot.key) },
        { name: `"${shot.slug}" lasts ${shot.durationSeconds}s`, test: (s) => shotAt(s, shot.slug)?.durationSeconds === shot.durationSeconds }
      );
    });
    if (title) checks.push({ name: `board titled ${title}`, test: (s) => sameText(s.title, title) && s.hasScreenplay });
    const opener = pick.one([
      "Plan this storyboard, one shot per line, in order:",
      "Lay out these shots on the board, in this order:",
      "Build the storyboard from this shot list:"
    ]);
    const titled = title ? ` Load it as a screenplay titled "${title}".` : "";
    return {
      objective: `${opener}\n${asks.join("\n")}\nUse the quoted name as each shot's title.${titled}`,
      createBridge: () => createStoryboardToolBridge(),
      checks,
      solve: async (call) => {
        if (title) {
          await call("ui_storyboard_set_screenplay", {
            screenplay: { type: "screenplay", title, shots: shots.map((s) => ({ action: s.action, slug: s.slug, durationSeconds: s.durationSeconds })) }
          });
          return;
        }
        for (const s of shots) {
          await call("ui_storyboard_add_shot", { action: s.action, slug: s.slug, durationSeconds: s.durationSeconds });
        }
      }
    };
  }
};

type ShotEdit = "retime" | "retitle" | "rewrite" | "approve" | "insert" | "select";

export const STORYBOARD_EDIT: TaskFamily<StoryboardBridgeFinalState> = {
  id: "storyboard-edit",
  surface: "storyboard",
  make(pick) {
    const ideas = pick.some(SHOT_IDEAS, pick.int(3, 5));
    const seed = ideas.map((idea) => ({ slug: idea.slug, action: idea.action, durationSeconds: pick.int(3, 7) }));
    const spare = SHOT_IDEAS.filter((idea) => !ideas.includes(idea));
    const ops = pick.some(["retime", "retitle", "rewrite", "approve", "insert", "select"] as ShotEdit[], pick.int(1, 3));
    const targets = pick.some(seed, ops.length);
    const asks: string[] = [];
    const checks: Check<StoryboardBridgeFinalState>[] = [{ name: "board would save", test: (s) => s.savable }];
    /** Edits by the shot's original title; the solution resolves ids from state. */
    const steps: Array<(idOf: (slug: string) => string, indexOf: (slug: string) => number) => [string, Record<string, unknown>]> = [];
    const touched = new Set<string>();
    let inserted = 0;
    ops.forEach((op, i) => {
      const target = targets[i]!;
      if (op === "insert") {
        const idea = pick.one(spare);
        const durationSeconds = pick.int(2, 6);
        inserted += 1;
        steps.push((_idOf, indexOf) => ["ui_storyboard_add_shot", { action: idea.action, slug: idea.slug, durationSeconds, index: indexOf(target.slug) + 1 }]);
        asks.push(`add a ${durationSeconds}-second shot titled "${idea.slug}" (${idea.action}) right after "${target.slug}"`);
        checks.push(
          { name: `"${idea.slug}" follows "${target.slug}"`, test: (s) => indexOfSlug(s, idea.slug) === indexOfSlug(s, target.slug) + 1 && indexOfSlug(s, target.slug) >= 0 },
          { name: `"${idea.slug}" shows ${idea.key} for ${durationSeconds}s`, test: (s) => mentions(shotAt(s, idea.slug)?.action, idea.key) && shotAt(s, idea.slug)?.durationSeconds === durationSeconds }
        );
        return;
      }
      touched.add(target.slug);
      if (op === "retime") {
        const to = target.durationSeconds + pick.one([-2, -1, 1, 2, 3]);
        steps.push((idOf) => ["ui_storyboard_update_shot", { target: idOf(target.slug), durationSeconds: to }]);
        asks.push(`make "${target.slug}" ${to} seconds long`);
        checks.push({ name: `"${target.slug}" lasts ${to}s`, test: (s) => shotAt(s, target.slug)?.durationSeconds === to && mentions(shotAt(s, target.slug)?.action, target.action) });
      } else if (op === "retitle") {
        const next = pick.one(spare.filter((idea) => !asks.some((a) => a.includes(idea.slug)))).slug.replace(/^(\w+)/, "New $1");
        steps.push((idOf) => ["ui_storyboard_update_shot", { target: idOf(target.slug), slug: next }]);
        asks.push(`rename the shot "${target.slug}" to "${next}"`);
        checks.push({
          name: `"${target.slug}" renamed "${next}"`,
          test: (s) => !shotAt(s, target.slug) && shotAt(s, next)?.action === target.action && shotAt(s, next)?.durationSeconds === target.durationSeconds
        });
      } else if (op === "rewrite") {
        const idea = pick.one(spare);
        steps.push((idOf) => ["ui_storyboard_update_shot", { target: idOf(target.slug), action: idea.action }]);
        asks.push(`change what "${target.slug}" shows to: ${idea.action} (keep its title and length)`);
        checks.push({
          name: `"${target.slug}" now shows ${idea.key}`,
          test: (s) => mentions(shotAt(s, target.slug)?.action, idea.key) && shotAt(s, target.slug)?.durationSeconds === target.durationSeconds
        });
      } else if (op === "approve") {
        steps.push((idOf) => ["ui_storyboard_update_shot", { target: idOf(target.slug), status: "approved" }]);
        asks.push(`mark "${target.slug}" as approved`);
        checks.push({ name: `"${target.slug}" approved`, test: (s) => shotAt(s, target.slug)?.status === "approved" && shotAt(s, target.slug)?.action === target.action });
      } else {
        steps.push((idOf) => ["ui_storyboard_select_shot", { target: idOf(target.slug) }]);
        asks.push(`select "${target.slug}" so I can look at it`);
        checks.push({ name: `"${target.slug}" selected`, test: (s) => s.selectedShotId !== null && s.selectedShotId === shotAt(s, target.slug)?.id });
      }
    });
    checks.push({ name: `board has ${seed.length + inserted} shots`, test: (s) => s.shots.length === seed.length + inserted });
    for (const shot of seed.filter((x) => !touched.has(x.slug))) {
      checks.push({
        name: `"${shot.slug}" left alone`,
        test: (s) => {
          const now = shotAt(s, shot.slug);
          return now?.action === shot.action && now.durationSeconds === shot.durationSeconds && now.status === "planned";
        }
      });
    }
    const layout = seed.map((s) => `"${s.slug}" (${s.durationSeconds}s)`);
    // Generation and rendering are off the table: these are planning edits.
    return {
      objective: `The storyboard has ${list(layout)}. Please ${list(asks)}. Don't generate anything and leave the other shots as they are.`,
      createBridge: () => {
        const shots = seed.map((s) => ({ ...s }));
        return createStoryboardToolBridge({ title: "Board", shots });
      },
      checks,
      solve: async (call) => {
        for (const step of steps) {
          const state = (await call("ui_storyboard_get_state", {})) as { shots: Array<{ id: string; index: number; slug?: string }> };
          const find = (slug: string) => state.shots.find((shot) => shot.slug === slug);
          const [name, args] = step(
            (slug) => find(slug)!.id,
            (slug) => find(slug)!.index
          );
          await call(name, args);
        }
      }
    };
  }
};

// ---------------------------------------------------------------- script

const SPEAKER_NAMES = ["Maya", "Theo", "Priya", "Jonas", "Lena", "Omar", "Iris", "Felix", "Nadia", "Sam"];
const LINE_TEXTS = [
  "We have ten minutes before the doors open.",
  "Did anyone check the second camera?",
  "This is the part where everything changes.",
  "I left the keys on the counter, I'm sure of it.",
  "Welcome back to the channel, today we're building a bird house.",
  "Grab a cup of coffee and let's get started.",
  "The storm is moving faster than we thought.",
  "Every great product starts with a small annoyance.",
  "Can you hear that? Something is in the walls.",
  "Thanks for watching, see you next week.",
  "First, measure twice and cut once.",
  "Nobody told me the bridge was closed.",
  "Our team shipped the update last night.",
  "Look at the light on the water right now.",
  "You said you'd call when you landed.",
  "Here's the trick most people miss.",
  "The recipe only needs four ingredients.",
  "Turn left at the old mill and keep going.",
  "I think we finally found it.",
  "Let's take it from the top, one more time."
];
const FORMATS = ["voiceover", "dialogue", "interview", "ad-read", "tutorial"] as const;
const PACES = ["slow", "normal", "fast"] as const;

const speakerName = (s: ScriptBridgeFinalState, speakerId: string | null) =>
  speakerId === null ? null : (s.cast.find((c) => c.id === speakerId)?.name ?? null);
const lineById = (s: ScriptBridgeFinalState, id: string) => s.lines.find((l) => l.id === id);
const hasSpeaker = (s: ScriptBridgeFinalState, name: string) => s.cast.filter((c) => sameText(c.name, name)).length === 1;

export const SCRIPT_BUILD: TaskFamily<ScriptBridgeFinalState> = {
  id: "script-build",
  surface: "script",
  make(pick) {
    const speakers = pick.some(SPEAKER_NAMES, pick.int(1, 3));
    const lines = pick.some(LINE_TEXTS, pick.int(3, 6)).map((text, i) => ({
      text,
      // Every speaker gets at least one line.
      speaker: i < speakers.length ? speakers[i]! : pick.one(speakers)
    }));
    const setup = pick.chance(0.5)
      ? { format: pick.one(FORMATS), length_seconds: pick.int(2, 12) * 5, pace: pick.one(PACES) }
      : null;
    const checks: Check<ScriptBridgeFinalState>[] = [
      ...speakers.map((name) => ({ name: `cast has ${name}`, test: (s: ScriptBridgeFinalState) => hasSpeaker(s, name) })),
      { name: `script has ${lines.length} lines`, test: (s) => s.lines.length === lines.length },
      ...lines.flatMap((line, i) => [
        { name: `line ${i} reads "${line.text}"`, test: (s: ScriptBridgeFinalState) => sameText(s.lines[i]?.text, line.text) },
        { name: `line ${i} spoken by ${line.speaker}`, test: (s: ScriptBridgeFinalState) => sameText(speakerName(s, s.lines[i]?.speakerId ?? null) ?? "", line.speaker) }
      ])
    ];
    if (setup) {
      checks.push({
        name: `setup ${setup.format}, ${setup.length_seconds}s, ${setup.pace}`,
        test: (s) => s.setup?.format === setup.format && s.setup.length_seconds === setup.length_seconds && s.setup.pace === setup.pace
      });
    }
    const body = lines.map((l) => `${l.speaker}: ${l.text}`).join("\n");
    const castLine = speakers.length === 1 ? `The only speaker is ${speakers[0]}.` : `The cast is ${list(speakers)}.`;
    const setupLine = setup ? `\nSet it up as a ${setup.format} of ${setup.length_seconds} seconds at a ${setup.pace} pace.` : "";
    const opener = pick.one(["Write this script exactly as given.", "Put these lines into the script, word for word.", "Enter this script, one line each, in order."]);
    return {
      objective: `${opener} ${castLine}\n${body}${setupLine}\nDon't voice anything yet.`,
      createBridge: () => createScriptToolBridge({ title: "Script" }),
      checks,
      solve: async (call) => {
        if (setup) await call("ui_script_set_setup", setup);
        const ids = new Map<string, string>();
        for (const name of speakers) {
          const added = (await call("ui_script_add_speaker", { name })) as { speaker: { id: string } };
          ids.set(name, added.speaker.id);
        }
        for (const line of lines) await call("ui_script_add_line", { text: line.text, speakerId: ids.get(line.speaker) });
      }
    };
  }
};

type LineEdit = "rewrite" | "reassign" | "insert" | "newSpeaker" | "pace";

export const SCRIPT_EDIT: TaskFamily<ScriptBridgeFinalState> = {
  id: "script-edit",
  surface: "script",
  make(pick) {
    const speakers = pick.some(SPEAKER_NAMES, pick.int(2, 3)).map((name, i) => ({ id: `spk_${i + 1}`, name }));
    const texts = pick.some(LINE_TEXTS, pick.int(4, 6));
    const seed = texts.map((text, i) => ({ id: `line_${i + 1}`, text, speakerId: (i < speakers.length ? speakers[i]! : pick.one(speakers)).id }));
    const spareTexts = LINE_TEXTS.filter((t) => !texts.includes(t));
    const ops = pick.some(["rewrite", "reassign", "insert", "newSpeaker", "pace"] as LineEdit[], pick.int(1, 3));
    const targets = pick.some(seed, ops.length);
    const nameOf = (id: string) => speakers.find((s) => s.id === id)!.name;
    const asks: string[] = [];
    const checks: Check<ScriptBridgeFinalState>[] = [];
    /** Each step reads the live script: speaker ids by name, line index by id. */
    interface Live {
      speakerId: (name: string) => string;
      indexOf: (lineId: string) => number;
    }
    const steps: Array<(live: Live) => [string, Record<string, unknown>]> = [];
    const touched = new Set<string>();
    let inserted = 0;
    ops.forEach((op, i) => {
      const target = targets[i]!;
      if (op === "pace") {
        const pace = pick.one(PACES);
        const seconds = pick.int(3, 18) * 5;
        steps.push(() => ["ui_script_set_setup", { pace, length_seconds: seconds }]);
        asks.push(`set the pace to ${pace} and the target length to ${seconds} seconds`);
        checks.push({ name: `setup ${pace}, ${seconds}s`, test: (s) => s.setup?.pace === pace && s.setup.length_seconds === seconds });
        return;
      }
      if (op === "insert") {
        const text = pick.one(spareTexts.filter((t) => !asks.some((a) => a.includes(t))));
        const speaker = pick.one(speakers);
        inserted += 1;
        steps.push((live) => ["ui_script_add_line", { text, speakerId: live.speakerId(speaker.name), index: live.indexOf(target.id) + 1 }]);
        asks.push(`add a line for ${speaker.name} right after "${target.text}": "${text}"`);
        checks.push({
          name: `new ${speaker.name} line follows ${target.id}`,
          test: (s) => {
            const at = s.lines.findIndex((l) => l.id === target.id);
            const next = s.lines[at + 1];
            return at >= 0 && sameText(next?.text, text) && sameText(speakerName(s, next?.speakerId ?? null) ?? "", speaker.name);
          }
        });
        return;
      }
      touched.add(target.id);
      if (op === "rewrite") {
        const text = pick.one(spareTexts.filter((t) => !asks.some((a) => a.includes(t))));
        steps.push(() => ["ui_script_set_line_text", { target: target.id, text }]);
        asks.push(`change the line "${target.text}" to "${text}"`);
        checks.push({ name: `${target.id} rewritten`, test: (s) => sameText(lineById(s, target.id)?.text, text) && lineById(s, target.id)?.speakerId === target.speakerId });
      } else if (op === "reassign") {
        const other = pick.one(speakers.filter((s) => s.id !== target.speakerId));
        steps.push(() => ["ui_script_set_speaker", { target: target.id, speakerId: other.id }]);
        asks.push(`give the line "${target.text}" to ${other.name} instead of ${nameOf(target.speakerId)}`);
        checks.push({ name: `${target.id} spoken by ${other.name}`, test: (s) => lineById(s, target.id)?.speakerId === other.id && sameText(lineById(s, target.id)?.text, target.text) });
      } else {
        const name = pick.one(SPEAKER_NAMES.filter((n) => !speakers.some((s) => s.name === n)));
        steps.push(() => ["ui_script_add_speaker", { name }]);
        steps.push((live) => ["ui_script_set_speaker", { target: target.id, speakerId: live.speakerId(name) }]);
        asks.push(`add ${name} to the cast and give them the line "${target.text}"`);
        checks.push(
          { name: `cast has ${name}`, test: (s) => hasSpeaker(s, name) },
          { name: `${target.id} spoken by ${name}`, test: (s) => sameText(speakerName(s, lineById(s, target.id)?.speakerId ?? null) ?? "", name) && sameText(lineById(s, target.id)?.text, target.text) }
        );
      }
    });
    checks.push({ name: `script has ${seed.length + inserted} lines`, test: (s) => s.lines.length === seed.length + inserted });
    for (const line of seed.filter((l) => !touched.has(l.id))) {
      checks.push({ name: `${line.id} left alone`, test: (s) => sameText(lineById(s, line.id)?.text, line.text) && lineById(s, line.id)?.speakerId === line.speakerId });
    }
    for (const speaker of speakers) {
      checks.push({ name: `${speaker.name} still in the cast`, test: (s) => s.cast.some((c) => c.id === speaker.id && c.name === speaker.name) });
    }
    const body = seed.map((l) => `${nameOf(l.speakerId)}: ${l.text}`).join("\n");
    return {
      objective: `The open script reads:\n${body}\nPlease ${list(asks)}. Leave the other lines alone and don't voice anything.`,
      createBridge: () => createScriptToolBridge({ title: "Script", cast: speakers, lines: seed }),
      checks,
      solve: async (call) => {
        for (const step of steps) {
          const state = (await call("ui_script_get_state", {})) as {
            cast: Array<{ id: string; name: string }>;
            lines: Array<{ id: string; index: number }>;
          };
          const [name, args] = step({
            speakerId: (speaker) => state.cast.find((c) => c.name === speaker)!.id,
            indexOf: (lineId) => state.lines.find((l) => l.id === lineId)!.index
          });
          await call(name, args);
        }
      }
    };
  }
};

export const STORYBOARD_SCRIPT_FAMILIES: readonly ErasedFamily[] = [
  defineFamily(STORYBOARD_BUILD),
  defineFamily(STORYBOARD_EDIT),
  defineFamily(SCRIPT_BUILD),
  defineFamily(SCRIPT_EDIT)
];
