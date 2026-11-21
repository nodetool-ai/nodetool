/**
 * Generated training tasks: many distinct requests, each with its own world
 * and its own checks.
 *
 * A family turns a seeded random source into one concrete task: the user's
 * request, the starting document, and checks over the document the turn left
 * behind. Different parameters ask for different work (other objects, other
 * timings, other edits), so each generated task is a new problem with an
 * exact grade, not a rewording of an old one. Generation is deterministic
 * from the seed, so a task id names the same task on every run and sampling
 * can resume.
 */
import {
  createModel3DToolBridge,
  createSvgToolBridge,
  createTimelineToolBridge,
  type ErasedJob,
  type HeadlessSurfaceBridge,
  type HeadlessTool,
  type Model3DBridgeFinalState,
  type OutcomeResult,
  type SvgBridgeFinalState,
  type TimelineBridgeFinalState
} from "@nodetool-ai/agents";

/** mulberry32: small, seeded, and the same on every platform. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Picker {
  constructor(private readonly random: () => number) {}
  int(min: number, max: number): number {
    return min + Math.floor(this.random() * (max - min + 1));
  }
  one<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)]!;
  }
  /** `count` distinct items, in random order. */
  some<T>(items: readonly T[], count: number): T[] {
    const pool = [...items];
    const out: T[] = [];
    while (out.length < count && pool.length > 0) {
      out.push(pool.splice(this.int(0, pool.length - 1), 1)[0]!);
    }
    return out;
  }
  chance(p: number): boolean {
    return this.random() < p;
  }
}

export interface Check<TFinal> {
  name: string;
  test: (state: TFinal) => boolean;
}

/** Calls one of the world's tools by name, as a model's code action would. */
export type CallTool = (name: string, args: Record<string, unknown>) => Promise<unknown>;

/**
 * A world whose state lives on the server rather than in the browser: the
 * user it was seeded for, a way to read its state back after the turn (server
 * reads are async, grading is not), and the server capabilities the reference
 * solution calls. A browser world has none of these.
 */
export interface ServerWorld {
  /** The user the chat session must run as, so the turn sees the seeded state. */
  userId: string;
  /** Re-read the state `finalState` returns. Runs before every grade. */
  settle: () => Promise<void>;
  /** Invoke a server capability by name, as the reference solution does. */
  call: CallTool;
}

export type TaskBridge<TFinal> = HeadlessSurfaceBridge<TFinal> & Partial<ServerWorld>;

export interface GeneratedTask<TFinal> {
  objective: string;
  createBridge: () => TaskBridge<TFinal> | Promise<TaskBridge<TFinal>>;
  checks: Check<TFinal>[];
  /**
   * A reference solution through the world's own tools. Tests run it to prove
   * the task can be done with the tool contracts and that its checks accept
   * the result.
   */
  solve: (call: CallTool) => Promise<void>;
}

export interface TaskFamily<TFinal> {
  id: string;
  /** The editor the browser would have focused, if it has a focus type. */
  surface?: string;
  make(pick: Picker): GeneratedTask<TFinal>;
}

/**
 * A family with its state type sealed inside, so families for different
 * editors sit in one list. The only way a family reaches the generator.
 */
export interface ErasedFamily {
  id: string;
  /** The task one seed draws: its request and its job. */
  draw(seed: number, id: string): { objective: string; job: ErasedJob };
  /** Build one task's world, optionally run the reference solution, and grade it. */
  solveAndGrade(seed: number, solved: boolean): Promise<OutcomeResult[]>;
}

function gradeAll<TFinal>(checks: Check<TFinal>[], state: TFinal): OutcomeResult[] {
  const passes = (check: Check<TFinal>): boolean => {
    try {
      return check.test(state);
    } catch {
      // A check that throws on a half-built world is a failed check.
      return false;
    }
  };
  return checks.map((check) => ({ name: check.name, describe: check.name, passed: passes(check) }));
}

export function defineFamily<TFinal>(family: TaskFamily<TFinal>): ErasedFamily {
  const make = (seed: number) => family.make(new Picker(seededRandom(seed)));
  return {
    id: family.id,
    draw(seed, id) {
      const task = make(seed);
      const job: ErasedJob = {
        id,
        statement: task.objective,
        surfaces: family.surface ? [family.surface] : [],
        difficulty: "standard",
        objective: task.objective,
        outcomeNames: task.checks.map((c) => c.name),
        start: async () => {
          const bridge = await task.createBridge();
          // runChatJob reads `userId` and `settle` off the world (ChatJobWorld).
          const world = {
            tools: bridge.tools as HeadlessTool[],
            grade: () => gradeAll(task.checks, bridge.finalState()),
            userId: bridge.userId,
            settle: bridge.settle
          };
          return world;
        }
      };
      return { objective: task.objective, job };
    },
    async solveAndGrade(seed, solved) {
      const task = make(seed);
      const bridge = await task.createBridge();
      if (solved) {
        const tools = new Map(bridge.tools.map((t) => [t.name, t]));
        await task.solve(async (name, args) => {
          const tool = tools.get(name);
          if (tool) return tool.execute(args);
          if (bridge.call) return bridge.call(name, args);
          throw new Error(`no tool ${name}`);
        });
      }
      await bridge.settle?.();
      return gradeAll(task.checks, bridge.finalState());
    }
  };
}

/**
 * `count` distinct tasks from each family, ids `<prefix>/<family>/<n>`. A draw
 * that repeats an earlier request is skipped, so ids stay stable for a given
 * seed and count.
 */
export function generateTasks(
  families: readonly ErasedFamily[],
  count: number,
  seed = 1,
  prefix = "gen"
): ErasedJob[] {
  return families.flatMap((family, f) => {
    const jobs: ErasedJob[] = [];
    const seen = new Set<string>();
    for (let draw = 0; jobs.length < count && draw < count * 20; draw++) {
      const drawn = family.draw(seed * 100_003 + f * 10_007 + draw, `${prefix}/${family.id}/${String(jobs.length).padStart(3, "0")}`);
      if (seen.has(drawn.objective)) continue;
      seen.add(drawn.objective);
      jobs.push(drawn.job);
    }
    return jobs;
  });
}

export const list = (items: string[]): string =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

// ---------------------------------------------------------------- 3D scenes

const MESH_KINDS = ["box", "sphere", "cylinder", "torus", "plane"] as const;
const LIGHT_KINDS = ["pointLight", "directionalLight"] as const;
const OBJECT_NAMES = [
  "Crate", "Orb", "Pillar", "Ring", "Pedestal", "Disc", "Column", "Beacon",
  "Anvil", "Totem", "Dome", "Plinth", "Marble", "Block", "Wheel", "Spire"
];
const LIGHT_NAMES = ["Key Light", "Fill Light", "Lamp", "Sun", "Glow"];
export const COLORS: Array<[string, string]> = [
  ["red", "#e63946"], ["teal", "#2a9d8f"], ["orange", "#f4a261"], ["navy", "#1d3557"],
  ["yellow", "#ffd166"], ["purple", "#7b2cbf"], ["green", "#06d6a0"], ["pink", "#ff70a6"]
];
const KIND_WORD: Record<string, string> = {
  box: "box", sphere: "sphere", cylinder: "cylinder", torus: "torus", plane: "plane",
  pointLight: "point light", directionalLight: "directional light"
};

type Vec3 = [number, number, number];
const fmtVec = (v: Vec3) => `(${v.join(", ")})`;
const near = (a: readonly number[], b: readonly number[]) => a.every((x, i) => Math.abs(x - (b[i] ?? NaN)) < 0.01);
const byName = (s: Model3DBridgeFinalState, name: string) =>
  s.objects.find((o) => o.name.toLowerCase() === name.toLowerCase());
const sameColor = (a: string | undefined, b: string) => (a ?? "").toLowerCase() === b.toLowerCase();

export const MODEL3D_BUILD: TaskFamily<Model3DBridgeFinalState> = {
  id: "model3d-build",
  surface: "model3d",
  make(pick) {
    const meshes = pick.some(OBJECT_NAMES, pick.int(2, 4)).map((name) => ({
      name,
      kind: pick.one(MESH_KINDS),
      position: [pick.int(-3, 3), pick.int(0, 3), pick.int(-3, 3)] as Vec3,
      color: pick.chance(0.6) ? pick.one(COLORS) : null
    }));
    const light = pick.chance(0.7)
      ? { name: pick.one(LIGHT_NAMES), kind: pick.one(LIGHT_KINDS), position: [0, pick.int(3, 6), pick.int(0, 3)] as Vec3 }
      : null;
    const parts = meshes.map(
      (m) => `a ${KIND_WORD[m.kind]} named '${m.name}' at ${fmtVec(m.position)}${m.color ? ` colored ${m.color[1]}` : ""}`
    );
    if (light) parts.push(`a ${KIND_WORD[light.kind]} named '${light.name}' at ${fmtVec(light.position)}`);
    // Every opener names the 3D scene: the editor has no focus type, so the
    // request is the only thing telling the model which document to edit.
    const opener = pick.one([
      "In the open 3D scene, build",
      "Set up the 3D scene with",
      "In the 3D editor I need",
      "Add to the 3D scene"
    ]);
    const checks: Check<Model3DBridgeFinalState>[] = meshes.flatMap((m) => [
      { name: `${m.name} is a mesh at ${fmtVec(m.position)}`, test: (s: Model3DBridgeFinalState) => byName(s, m.name)?.type === "Mesh" && near(byName(s, m.name)!.position, m.position) },
      ...(m.color ? [{ name: `${m.name} is ${m.color[1]}`, test: (s: Model3DBridgeFinalState) => sameColor(byName(s, m.name)?.materialColor, m.color![1]) }] : [])
    ]);
    if (light) {
      const type = light.kind === "pointLight" ? "PointLight" : "DirectionalLight";
      checks.push({ name: `${light.name} is a ${type} at ${fmtVec(light.position)}`, test: (s) => byName(s, light.name)?.type === type && near(byName(s, light.name)!.position, light.position) });
    }
    return {
      objective: `${opener} ${list(parts)}.`,
      createBridge: () => createModel3DToolBridge(),
      checks,
      solve: async (call) => {
        for (const o of [...meshes, ...(light ? [{ ...light, color: null }] : [])]) {
          await call("ui_3d_add_object", { kind: o.kind, name: o.name });
          await call("ui_3d_set_transform", { target: o.name, position: o.position });
          if (o.color) await call("ui_3d_set_material_color", { target: o.name, color: o.color[1] });
        }
      }
    };
  }
};

export const MODEL3D_EDIT: TaskFamily<Model3DBridgeFinalState> = {
  id: "model3d-edit",
  make(pick) {
    const names = pick.some(OBJECT_NAMES, pick.int(3, 5));
    const seed = names.map((name) => ({ name, kind: pick.one(MESH_KINDS) }));
    const ops = pick.some(["rename", "recolor", "move", "scale", "hide", "delete"] as const, pick.int(2, 3));
    const targets = pick.some(names, ops.length);
    const asks: string[] = [];
    const checks: Check<Model3DBridgeFinalState>[] = [];
    const steps: Array<[string, Record<string, unknown>]> = [];
    const touched = new Set<string>();
    ops.forEach((op, i) => {
      const target = targets[i]!;
      touched.add(target);
      if (op === "rename") {
        const next = pick.one(OBJECT_NAMES.filter((n) => !names.includes(n)));
        steps.push(["ui_3d_rename_object", { target, name: next }]);
        asks.push(`rename '${target}' to '${next}'`);
        checks.push({ name: `${target} renamed ${next}`, test: (s) => !!byName(s, next) && !byName(s, target) });
      } else if (op === "recolor") {
        const color = pick.one(COLORS);
        steps.push(["ui_3d_set_material_color", { target, color: color[1] }]);
        asks.push(`make '${target}' ${color[0]} (${color[1]})`);
        checks.push({ name: `${target} is ${color[1]}`, test: (s) => sameColor(byName(s, target)?.materialColor, color[1]) });
      } else if (op === "move") {
        const to: Vec3 = [pick.int(-4, 4), pick.int(0, 3), pick.int(-4, 4)];
        steps.push(["ui_3d_set_transform", { target, position: to }]);
        asks.push(`move '${target}' to ${fmtVec(to)}`);
        checks.push({ name: `${target} at ${fmtVec(to)}`, test: (s) => near(byName(s, target)?.position ?? [], to) });
      } else if (op === "scale") {
        const factor = pick.one([0.5, 2, 3]);
        steps.push(["ui_3d_set_transform", { target, scale: [factor, factor, factor] }]);
        asks.push(`scale '${target}' to ${factor}x on every axis`);
        checks.push({ name: `${target} scale ${factor}`, test: (s) => near(byName(s, target)?.scale ?? [], [factor, factor, factor]) });
      } else if (op === "hide") {
        steps.push(["ui_3d_set_visibility", { target, visible: false }]);
        asks.push(`hide '${target}' without deleting it`);
        checks.push({ name: `${target} hidden`, test: (s) => byName(s, target)?.visible === false });
      } else {
        steps.push(["ui_3d_delete_object", { target }]);
        asks.push(`delete '${target}'`);
        checks.push({ name: `${target} deleted`, test: (s) => !byName(s, target) });
      }
    });
    for (const name of names.filter((n) => !touched.has(n))) {
      checks.push({ name: `${name} left alone`, test: (s) => byName(s, name)?.visible === true });
    }
    const objective = `The open 3D scene has ${list(seed.map((o) => `a ${KIND_WORD[o.kind]} named '${o.name}'`))}. Please ${list(asks)}. Leave everything else as it is.`;
    return {
      objective,
      createBridge: () => createModel3DToolBridge({ objects: seed }),
      checks,
      solve: async (call) => {
        for (const [name, args] of steps) await call(name, args);
      }
    };
  }
};

// ---------------------------------------------------------------- SVG

interface SvgShape {
  id: string;
  tag: "rect" | "circle" | "ellipse";
  attrs: Record<string, string>;
}

const SVG_IDS = ["sun", "badge", "card", "dot", "frame", "halo", "tile", "pill", "lens", "button"];

function shapeMarkup(shape: SvgShape): string {
  const attrs = Object.entries(shape.attrs).map(([k, v]) => `${k}="${v}"`).join(" ");
  return `  <${shape.tag} id="${shape.id}" ${attrs}/>`;
}

/** The attributes of the element with `id`, from fill="…" or style="fill:…". */
export function svgElement(markup: string, id: string): { tag: string; attrs: Record<string, string> } | null {
  const element = new RegExp(`<([a-zA-Z]+)\\b[^>]*\\bid=["']${id}["'][^>]*>`).exec(markup);
  if (!element) return null;
  const attrs: Record<string, string> = {};
  for (const match of element[0].matchAll(/([a-zA-Z_:-][\w:.-]*)=["']([^"']*)["']/g)) {
    attrs[match[1]!] = match[2]!;
  }
  for (const decl of (attrs.style ?? "").split(";")) {
    const [key, value] = decl.split(":").map((part) => part.trim());
    if (key && value) attrs[key] = value;
  }
  return { tag: element[1]!, attrs };
}

export const SVG_EDIT: TaskFamily<SvgBridgeFinalState> = {
  id: "svg-edit",
  surface: "svg",
  make(pick) {
    const ids = pick.some(SVG_IDS, pick.int(2, 4));
    const shapes = ids.map((id, i): SvgShape => {
      const tag = pick.one(["rect", "circle", "ellipse"] as const);
      const fill = pick.one(COLORS)[1];
      const x = 20 + i * 45;
      if (tag === "rect") return { id, tag, attrs: { x: String(x), y: "20", width: "36", height: "36", fill } };
      if (tag === "circle") return { id, tag, attrs: { cx: String(x + 18), cy: "40", r: "18", fill } };
      return { id, tag, attrs: { cx: String(x + 18), cy: "40", rx: "18", ry: "12", fill } };
    });
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 120">\n${shapes.map(shapeMarkup).join("\n")}\n</svg>`;
    const ops = pick.some(["recolor", "remove", "add", "resize"] as const, pick.int(1, 3));
    const asks: string[] = [];
    const checks: Check<SvgBridgeFinalState>[] = [{ name: "markup is valid", test: (s) => s.issues.length === 0 }];
    // The reference solution: the shapes as they should end up.
    const solved: SvgShape[] = shapes.map((shape) => ({ ...shape, attrs: { ...shape.attrs } }));
    const touched = new Set<string>();
    for (const op of ops) {
      const free = shapes.filter((s) => !touched.has(s.id));
      if (op === "add") {
        const id = pick.one(SVG_IDS.filter((x) => !ids.includes(x)));
        const fill = pick.one(COLORS)[1];
        const r = pick.int(6, 14);
        solved.push({ id, tag: "circle", attrs: { cx: "110", cy: "95", r: String(r), fill } });
        asks.push(`add a circle with id "${id}" at (${110}, ${95}) with radius ${r} and fill ${fill}`);
        checks.push({
          name: `${id} added`,
          test: (s) => {
            const el = svgElement(s.markup, id);
            return el?.tag === "circle" && el.attrs.r === String(r) && el.attrs.fill?.toLowerCase() === fill;
          }
        });
        continue;
      }
      const target = free.length > 0 ? pick.one(free) : null;
      if (!target) continue;
      touched.add(target.id);
      if (op === "recolor") {
        const fill = pick.one(COLORS.map((c) => c[1]).filter((c) => c !== target.attrs.fill));
        solved.find((x) => x.id === target.id)!.attrs.fill = fill;
        asks.push(`change the fill of "${target.id}" to ${fill}`);
        checks.push({ name: `${target.id} fill ${fill}`, test: (s) => svgElement(s.markup, target.id)?.attrs.fill?.toLowerCase() === fill });
      } else if (op === "remove") {
        solved.splice(solved.findIndex((x) => x.id === target.id), 1);
        asks.push(`remove the element "${target.id}"`);
        checks.push({ name: `${target.id} removed`, test: (s) => svgElement(s.markup, target.id) === null });
      } else {
        const key = target.tag === "rect" ? "width" : target.tag === "circle" ? "r" : "rx";
        const value = String(Number(target.attrs[key]) + pick.int(4, 12));
        solved.find((x) => x.id === target.id)!.attrs[key] = value;
        asks.push(`set the ${key} of "${target.id}" to ${value}`);
        checks.push({ name: `${target.id} ${key} ${value}`, test: (s) => svgElement(s.markup, target.id)?.attrs[key] === value });
      }
    }
    for (const shape of shapes.filter((s) => !touched.has(s.id))) {
      checks.push({ name: `${shape.id} unchanged`, test: (s) => svgElement(s.markup, shape.id)?.attrs.fill?.toLowerCase() === shape.attrs.fill });
    }
    const save = pick.chance(0.6);
    checks.push(
      save
        ? { name: "saved", test: (s) => s.saves > 0 && !s.dirty }
        : { name: "not saved", test: (s) => s.saves === 0 }
    );
    const ending = save ? "Save it when you're done." : "Don't save yet, I want to look first.";
    return {
      objective: `In this SVG, ${list(asks)}. ${ending}`,
      createBridge: () => createSvgToolBridge({ name: "icons.svg", markup }),
      checks,
      solve: async (call) => {
        const next = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 120">\n${solved.map(shapeMarkup).join("\n")}\n</svg>`;
        await call("ui_svg_set_markup", { markup: next });
        if (save) await call("ui_svg_save", {});
      }
    };
  }
};

// ---------------------------------------------------------------- timeline

const TITLE_TEXTS = [
  "Welcome", "Chapter One", "Summer Sale", "Coming Soon", "Thank You", "Day 1",
  "Behind the Scenes", "Meet the Team", "Launch Night", "The End", "Part Two", "Subscribe"
];
// Preset ids `ui_timeline_animate_clip` accepts for an `in` role.
const ENTRANCES = ["fade", "slide", "pop", "typewriter", "wipe", "blur"];
const SHOT_NAMES = ["Intro", "Wide", "Close-up", "Reaction", "Detail", "Outro", "B-roll", "Cutaway"];
const clipsNamed = (s: TimelineBridgeFinalState, name: string) => s.clips.filter((c) => c.name === name);
/** Clips whose displayed text is `text`. A text clip's name is a label the model may choose freely. */
const clipsShowing = (s: TimelineBridgeFinalState, text: string) => {
  const ids = new Set(s.documentClips.filter((c) => c.textStyle?.text.trim() === text).map((c) => c.id));
  return s.clips.filter((c) => ids.has(c.id));
};

export const TIMELINE_TITLES: TaskFamily<TimelineBridgeFinalState> = {
  id: "timeline-titles",
  surface: "timeline",
  make(pick) {
    let at = pick.int(0, 4) * 500;
    const titles = pick.some(TITLE_TEXTS, pick.int(1, 3)).map((text) => {
      const durationMs = pick.int(2, 6) * 500;
      const title = { text, startMs: at, durationMs, entrance: pick.chance(0.5) ? pick.one(ENTRANCES) : null };
      at += durationMs + pick.int(0, 2) * 500;
      return title;
    });
    const asks = titles.map(
      (t) => `"${t.text}" from ${t.startMs}ms for ${t.durationMs}ms${t.entrance ? ` with a ${t.entrance} entrance` : ""}`
    );
    const checks: Check<TimelineBridgeFinalState>[] = titles.flatMap((t) => [
      {
        name: `"${t.text}" at ${t.startMs}ms for ${t.durationMs}ms`,
        test: (s: TimelineBridgeFinalState) =>
          clipsShowing(s, t.text).some((c) => c.mediaType === "text" && c.startMs === t.startMs && Math.abs(c.durationMs - t.durationMs) <= 1)
      },
      ...(t.entrance
        ? [{
            name: `"${t.text}" ${t.entrance} entrance`,
            test: (s: TimelineBridgeFinalState) =>
              clipsShowing(s, t.text).some((c) => c.animations.some((a) => a.role === "in" && a.preset.includes(t.entrance!)))
          }]
        : [])
    ]);
    const opener = titles.length === 1 ? "Add a text title" : "Add these text titles";
    return {
      objective: `${opener}: ${list(asks)}.`,
      createBridge: () => createTimelineToolBridge(),
      checks,
      solve: async (call) => {
        const listed = (await call("ui_timeline_list_animation_presets", {})) as { presets?: Array<{ id: string; roles?: string[] }> };
        for (const t of titles) {
          const added = (await call("ui_timeline_add_text_clip", { text: t.text, startMs: t.startMs, durationMs: t.durationMs })) as { clip?: { id: string } };
          if (!t.entrance) continue;
          const preset = (listed.presets ?? []).find((p) => p.id.includes(t.entrance!) && (p.roles ?? ["in"]).includes("in"));
          await call("ui_timeline_animate_clip", { target: added.clip?.id ?? t.text, animations: [{ role: "in", preset: preset?.id ?? t.entrance }] });
        }
      }
    };
  }
};

export const TIMELINE_EDIT: TaskFamily<TimelineBridgeFinalState> = {
  id: "timeline-edit",
  surface: "timeline",
  make(pick) {
    const names = pick.some(SHOT_NAMES, pick.int(3, 4));
    let at = 0;
    const seed = names.map((name) => {
      const durationMs = pick.int(4, 10) * 500;
      const clip = { trackIndex: 0, name, startMs: at, durationMs };
      at += durationMs;
      return clip;
    });
    const end = at;
    const ops = pick.some(["move", "trim", "delete", "split"] as const, pick.int(1, 3));
    const targets = pick.some(seed, ops.length);
    const asks: string[] = [];
    const checks: Check<TimelineBridgeFinalState>[] = [];
    const steps: Array<[string, Record<string, unknown>]> = [];
    const touched = new Set<string>();
    ops.forEach((op, i) => {
      const clip = targets[i]!;
      touched.add(clip.name);
      if (op === "move") {
        const to = end + pick.int(1, 4) * 500;
        steps.push(["ui_timeline_move_clip", { target: clip.name, startMs: to }]);
        asks.push(`move "${clip.name}" so it starts at ${to}ms`);
        checks.push({ name: `${clip.name} starts ${to}ms`, test: (s) => clipsNamed(s, clip.name).some((c) => c.startMs === to && c.durationMs === clip.durationMs) });
      } else if (op === "trim") {
        const to = clip.durationMs - pick.int(1, Math.max(1, clip.durationMs / 500 - 2)) * 500;
        steps.push(["ui_timeline_trim_clip", { target: clip.name, durationMs: to }]);
        asks.push(`shorten "${clip.name}" to ${to}ms, keeping its start`);
        checks.push({ name: `${clip.name} lasts ${to}ms`, test: (s) => clipsNamed(s, clip.name).some((c) => c.startMs === clip.startMs && c.durationMs === to) });
      } else if (op === "delete") {
        steps.push(["ui_timeline_delete_clip", { target: clip.name }]);
        asks.push(`delete "${clip.name}"`);
        checks.push({ name: `${clip.name} deleted`, test: (s) => clipsNamed(s, clip.name).length === 0 });
      } else {
        const cut = clip.startMs + pick.int(1, clip.durationMs / 500 - 1) * 500;
        steps.push(["ui_timeline_split_clip", { target: clip.name, atMs: cut }]);
        asks.push(`split "${clip.name}" at ${cut}ms`);
        checks.push({
          name: `${clip.name} split at ${cut}ms`,
          test: (s) =>
            s.clips.some((c) => c.startMs === clip.startMs && c.durationMs === cut - clip.startMs) &&
            s.clips.some((c) => c.startMs === cut && c.durationMs === clip.startMs + clip.durationMs - cut)
        });
      }
    });
    for (const clip of seed.filter((c) => !touched.has(c.name))) {
      checks.push({ name: `${clip.name} untouched`, test: (s) => clipsNamed(s, clip.name).some((c) => c.startMs === clip.startMs && c.durationMs === clip.durationMs) });
    }
    const layout = seed.map((c) => `"${c.name}" (${c.startMs}–${c.startMs + c.durationMs}ms)`);
    return {
      objective: `The video track has ${list(layout)}. ${list(asks).replace(/^./, (c) => c.toUpperCase())}. Don't change the other clips.`,
      createBridge: () => createTimelineToolBridge({ tracks: [{ type: "video", name: "Video" }], clips: seed }),
      checks,
      solve: async (call) => {
        for (const [name, args] of steps) await call(name, args);
      }
    };
  }
};

export const TASK_FAMILIES: readonly ErasedFamily[] = [
  defineFamily(MODEL3D_BUILD),
  defineFamily(MODEL3D_EDIT),
  defineFamily(SVG_EDIT),
  defineFamily(TIMELINE_TITLES),
  defineFamily(TIMELINE_EDIT)
];
