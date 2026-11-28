/**
 * The guided Game flow's top-down adventure: a generated dungeon built from a
 * design's layout choices.
 *
 * {@link createAdventureGame} lays out rooms joined by corridors on a tile
 * grid, then fills them: gems to collect, enemies that patrol or chase,
 * hazards that hurt, and a sealed exit that opens once every gem is taken.
 * The player has health, a hurt flash and knockback. Losing all health
 * restarts the level and reaching the open exit wins it. Everything is pure
 * and seeded, so one design always builds the same level.
 *
 * The document starts on the `builtin:` placeholders. Once the flow has drawn
 * the art, {@link bindAdventureArt} reads the frame and tile rectangles the
 * asset preparation wrote and points the sprites, animations and wall tiles
 * at them, and adds the level music when a track was generated.
 */

import { gameDocument, type GameDocument, type GameEntity } from "@nodetool-ai/protocol";

export type AdventureSize = "small" | "medium" | "large";
export type AdventureDifficulty = "relaxed" | "normal" | "hard";

export interface AdventureOptions {
  /** Shown on the HUD when the level starts. */
  title?: string;
  /** The level's seed. The same seed and layout build the same level. */
  seed?: number;
  size?: AdventureSize;
  difficulty?: AdventureDifficulty;
}

/** The scene the adventure plays in. A lost run transitions back into it. */
export const ADVENTURE_SCENE_ID = "level";

/** Animations of each adventure spritesheet slot, in sheet row order. */
export const ADVENTURE_SHEETS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  player: { idle: 1, walk: 4 },
  enemy: { idle: 2, move: 2 },
  gem: { idle: 1 },
  hazard: { idle: 1 },
  exit: { closed: 1, open: 1 }
};

const CELL = 32;
const ROOM_CELL_WIDTH = 13;
const ROOM_CELL_HEIGHT = 11;

const GRID: Record<AdventureSize, { cols: number; rows: number; gems: number }> = {
  small: { cols: 3, rows: 2, gems: 5 },
  medium: { cols: 3, rows: 3, gems: 7 },
  large: { cols: 4, rows: 3, gems: 9 }
};

const TUNING: Record<AdventureDifficulty, {
  health: number; enemiesPerRoom: number; hazardsPerRoom: number; chaseShare: number;
  patrolSpeed: number; chaseSpeed: number; sight: number;
}> = {
  relaxed: { health: 5, enemiesPerRoom: 0.6, hazardsPerRoom: 0.6, chaseShare: 0.3, patrolSpeed: 1.6, chaseSpeed: 2, sight: 4.5 },
  normal: { health: 4, enemiesPerRoom: 0.9, hazardsPerRoom: 1, chaseShare: 0.5, patrolSpeed: 2, chaseSpeed: 2.5, sight: 5.5 },
  hard: { health: 3, enemiesPerRoom: 1.3, hazardsPerRoom: 1.6, chaseShare: 0.65, patrolSpeed: 2.4, chaseSpeed: 3, sight: 6.5 }
};

/** A small, fast, seeded generator (mulberry32). */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable seed for a piece of text, such as the design's title. */
export function adventureSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

interface Room {
  col: number;
  row: number;
  /** Interior bounds in tiles, inclusive. */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const centerOf = (room: Room): { x: number; y: number } => ({
  x: Math.floor((room.left + room.right) / 2),
  y: Math.floor((room.top + room.bottom) / 2)
});

interface Layout {
  width: number;
  height: number;
  floor: boolean[][];
  rooms: Room[];
  start: Room;
  exit: Room;
  /** Rooms in order of distance from the start, the start first. */
  byDistance: Room[];
}

function carve(floor: boolean[][], x0: number, y0: number, x1: number, y1: number): void {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y += 1) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 1) {
      floor[y]![x] = true;
    }
  }
}

/** A two-tile-wide corridor between two room centres: across, then down, then across. */
function corridor(floor: boolean[][], from: Room, to: Room, horizontal: boolean): void {
  const a = centerOf(from);
  const b = centerOf(to);
  if (horizontal) {
    const middle = Math.floor((a.x + b.x) / 2);
    carve(floor, a.x, a.y, middle, a.y + 1);
    carve(floor, middle, a.y, middle + 1, b.y + 1);
    carve(floor, middle, b.y, b.x, b.y + 1);
  } else {
    const middle = Math.floor((a.y + b.y) / 2);
    carve(floor, a.x, a.y, a.x + 1, middle);
    carve(floor, a.x, middle, b.x + 1, middle + 1);
    carve(floor, b.x, middle, b.x + 1, b.y);
  }
}

function generateLayout(size: AdventureSize, random: () => number): Layout {
  const { cols, rows } = GRID[size];
  const width = cols * ROOM_CELL_WIDTH + 2;
  const height = rows * ROOM_CELL_HEIGHT + 2;
  const floor = Array.from({ length: height }, () => Array.from({ length: width }, () => false));
  const between = (low: number, high: number): number => low + Math.floor(random() * (high - low + 1));
  const rooms: Room[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const roomWidth = between(6, 10);
      const roomHeight = between(5, 8);
      const left = 1 + col * ROOM_CELL_WIDTH + between(1, ROOM_CELL_WIDTH - roomWidth - 1);
      const top = 1 + row * ROOM_CELL_HEIGHT + between(1, ROOM_CELL_HEIGHT - roomHeight - 1);
      const room = { col, row, left, top, right: left + roomWidth - 1, bottom: top + roomHeight - 1 };
      rooms.push(room);
      carve(floor, room.left, room.top, room.right, room.bottom);
    }
  }
  const at = (col: number, row: number): Room | undefined =>
    col >= 0 && row >= 0 && col < cols && row < rows ? rooms[row * cols + col] : undefined;
  const key = (a: Room, b: Room): string => [a.row * cols + a.col, b.row * cols + b.col].sort((x, y) => x - y).join(":");
  const links = new Map<string, [Room, Room]>();
  const neighbours = (room: Room): Room[] =>
    [at(room.col + 1, room.row), at(room.col - 1, room.row), at(room.col, room.row + 1), at(room.col, room.row - 1)]
      .filter((entry): entry is Room => entry !== undefined);

  // A random spanning tree over the room grid, so every room is reachable.
  const corners = [at(0, 0), at(cols - 1, 0), at(0, rows - 1), at(cols - 1, rows - 1)].filter((entry): entry is Room => entry !== undefined);
  const start = corners[Math.floor(random() * corners.length)]!;
  const visited = new Set<Room>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const current = stack[stack.length - 1]!;
    const open = neighbours(current).filter((room) => !visited.has(room));
    if (open.length === 0) {
      stack.pop();
      continue;
    }
    const next = open[Math.floor(random() * open.length)]!;
    links.set(key(current, next), [current, next]);
    visited.add(next);
    stack.push(next);
  }
  // A few extra doors make loops, so a chaser can be led around.
  const extra = 1 + Math.floor(rooms.length / 4);
  for (let attempt = 0; attempt < extra * 6 && links.size < rooms.length - 1 + extra; attempt += 1) {
    const room = rooms[Math.floor(random() * rooms.length)]!;
    const options = neighbours(room).filter((other) => !links.has(key(room, other)));
    const other = options[Math.floor(random() * options.length)];
    if (other) {
      links.set(key(room, other), [room, other]);
    }
  }
  for (const [a, b] of links.values()) {
    corridor(floor, a, b, a.row === b.row);
  }

  // Rooms by link distance from the start: the exit goes in the farthest one.
  const distance = new Map<Room, number>([[start, 0]]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const [a, b] of links.values()) {
      const other = a === current ? b : b === current ? a : undefined;
      if (other && !distance.has(other)) {
        distance.set(other, distance.get(current)! + 1);
        queue.push(other);
      }
    }
  }
  const byDistance = [...rooms].sort((a, b) => distance.get(a)! - distance.get(b)!);
  return { width, height, floor, rooms, start, exit: byDistance[byDistance.length - 1]!, byDistance };
}

const PLAYER_SCRIPT = `(input) => {
  const { tick, pressed, events, entity, params } = input;
  const me = entity.id;
  const s = input.state ?? { hp: params.health, gems: 0, taken: [], hurt: 0, knockX: 0, knockY: 0, dead: 0,
    won: false, open: false, goal: false, anim: "", noteUntil: 0, sealedAt: -999 };
  const commands = [];
  const ui = (id, fields) => commands.push({ kind: "ui", id, ...fields });
  const note = (text, ticks) => { ui("hud-note", { text, visible: true }); s.noteUntil = ticks > 0 ? tick + ticks : 0; };
  if (tick <= 1) {
    commands.push({ kind: "hud", id: "score", text: " ", x: 0, y: 0 });
    commands.push({ kind: "hud", id: "win", text: " ", x: 0, y: 0 });
    ui("hud-health", { value: s.hp, max: params.health });
    ui("hud-gems", { text: "0 / " + params.gems });
    note(entity.props.title, 180);
  }
  const hit = (other) => {
    if (s.hurt > 0 || s.dead > 0 || s.won) return;
    s.hp -= 1;
    s.hurt = 70;
    const source = world.get(other);
    let dx = source ? entity.x - source.x : 0;
    let dy = source ? entity.y - source.y : 1;
    const length = Math.hypot(dx, dy) || 1;
    s.knockX = (dx / length) * 9;
    s.knockY = (dy / length) * 9;
    commands.push({ kind: "emit", event: "hurt" });
    commands.push({ kind: "emitParticles", emitter: "hurt", count: 18 });
    ui("hud-health", { value: Math.max(0, s.hp) });
    if (s.hp <= 0) {
      s.dead = 1;
      commands.push({ kind: "emit", event: "lose" });
      note("You were caught. Starting over...", 0);
    }
  };
  const seen = new Set();
  for (const event of events) {
    if (event.kind === "win") {
      s.won = true;
      note("Level cleared!", 0);
      ui("hud-goal", { text: "You made it out with every gem." });
      commands.push({ kind: "emitParticles", emitter: "sparkle", count: 40 });
    }
    if (event.kind !== "contact" || event.phase === "exit") continue;
    const other = event.entityId === me ? event.otherId : event.otherId === me ? event.entityId : "";
    if (!other || seen.has(other)) continue;
    seen.add(other);
    if (other.startsWith("gem") && !s.taken.includes(other) && s.dead === 0) {
      s.taken.push(other);
      s.gems += 1;
      commands.push({ kind: "despawn", entityId: other });
      commands.push({ kind: "emit", event: "gem" });
      commands.push({ kind: "emitParticles", emitter: "sparkle", count: 16 });
      ui("hud-gems", { text: s.gems + " / " + params.gems });
      if (s.gems >= params.gems && !s.open) {
        s.open = true;
        commands.push({ kind: "emit", event: "unlock" });
        note("The exit is open!", 150);
        ui("hud-goal", { text: "Every gem found. Get to the exit!" });
      }
    } else if (other.startsWith("enemy") || other.startsWith("hazard")) {
      hit(other);
    } else if (other === "exit" && !s.won && s.dead === 0) {
      if (s.open && !s.goal) {
        s.goal = true;
        commands.push({ kind: "spawn", prefabId: "goal", x: entity.x, y: entity.y });
      } else if (!s.open && tick - s.sealedAt > 120) {
        s.sealedAt = tick;
        note("Sealed. " + (params.gems - s.gems) + " gems still to find.", 120);
      }
    }
  }
  if (s.noteUntil > 0 && tick >= s.noteUntil) {
    s.noteUntil = 0;
    ui("hud-note", { visible: false });
  }
  let vx = 0;
  let vy = 0;
  if (s.dead > 0) {
    s.dead += 1;
    if (s.dead > 150) commands.push({ kind: "sceneTransition", sceneId: "${ADVENTURE_SCENE_ID}" });
  } else if (!s.won) {
    const x = (pressed.includes("right") ? 1 : 0) - (pressed.includes("left") ? 1 : 0);
    const y = (pressed.includes("up") ? 1 : 0) - (pressed.includes("down") ? 1 : 0);
    const length = Math.hypot(x, y) || 1;
    vx = (x / length) * params.speed;
    vy = (y / length) * params.speed;
  }
  if (Math.abs(s.knockX) + Math.abs(s.knockY) > 0.05) {
    vx += s.knockX;
    vy += s.knockY;
    s.knockX *= 0.8;
    s.knockY *= 0.8;
  } else {
    s.knockX = 0;
    s.knockY = 0;
  }
  commands.push({ kind: "setVelocity", x: vx, y: vy });
  const anim = Math.abs(vx) + Math.abs(vy) > 0.1 ? "walk" : "idle";
  if (anim !== s.anim) {
    s.anim = anim;
    commands.push({ kind: "playAnimation", clip: anim });
  }
  if (s.hurt > 0) {
    s.hurt -= 1;
    commands.push({ kind: "setVisual", opacity: s.hurt === 0 || Math.floor(s.hurt / 4) % 2 === 0 ? 1 : 0.35,
      tint: s.hurt > 55 ? "#ff8080" : "#ffffff" });
  }
  if (vx !== 0) commands.push({ kind: "setVisual", flipX: vx < 0 });
  return { state: s, commands };
}`;

const ENEMY_SCRIPT = `(input) => {
  const { tick, entity, params, random } = input;
  const p = entity.props;
  const s = input.state ?? { dir: random() < 0.5 ? -1 : 1, chasing: false, anim: "", wait: 0 };
  const commands = [];
  let vx = 0;
  let vy = 0;
  if (params.mode === "chase") {
    const hero = world.get("player");
    const dx = hero ? hero.x - entity.x : 0;
    const dy = hero ? hero.y - entity.y : 0;
    const distance = Math.hypot(dx, dy);
    if (hero && distance < params.sight) s.chasing = true;
    if (s.chasing && (!hero || distance > params.sight * 1.8)) s.chasing = false;
    if (s.chasing && distance > 0.05) {
      vx = (dx / distance) * params.speed;
      vy = (dy / distance) * params.speed;
    } else {
      const hx = p.homeX - entity.x;
      const hy = p.homeY - entity.y;
      const home = Math.hypot(hx, hy);
      if (home > 0.2) {
        vx = (hx / home) * params.speed * 0.6;
        vy = (hy / home) * params.speed * 0.6;
      }
    }
  } else {
    const along = p.axis === "x" ? entity.x : entity.y;
    const blocked = p.axis === "x" ? (s.dir > 0 ? entity.touching.right : entity.touching.left)
      : (s.dir > 0 ? entity.touching.up : entity.touching.down);
    if (s.wait > 0) {
      s.wait -= 1;
    } else if (blocked || (s.dir > 0 && along >= p.max) || (s.dir < 0 && along <= p.min)) {
      s.dir = -s.dir;
      s.wait = 20;
    } else if (p.axis === "x") {
      vx = s.dir * params.speed;
    } else {
      vy = s.dir * params.speed;
    }
  }
  commands.push({ kind: "setVelocity", x: vx, y: vy });
  const anim = Math.abs(vx) + Math.abs(vy) > 0.1 ? "move" : "idle";
  if (anim !== s.anim) {
    s.anim = anim;
    commands.push({ kind: "playAnimation", clip: anim });
  }
  if (Math.abs(vx) > 0.1) commands.push({ kind: "setVisual", flipX: vx < 0 });
  return { state: s, commands };
}`;

const EXIT_SCRIPT = `(input) => {
  const s = input.state ?? { open: false };
  const commands = [];
  if (!s.open && input.events.some((event) => event.kind === "trigger" && event.event === "unlock")) {
    s.open = true;
    commands.push({ kind: "playAnimation", clip: "open" });
    commands.push({ kind: "emitParticles", emitter: "swirl" });
    commands.push({ kind: "setVisual", tint: "#ffffff" });
  }
  return { state: s, commands };
}`;

function cameraScript(minX: number, maxX: number, minY: number, maxY: number): string {
  return `(input) => {
  const { entity, events, random } = input;
  const s = input.state ?? { x: entity.x, y: entity.y, shake: 0 };
  for (const event of events) {
    if (event.kind === "trigger" && event.event === "hurt") s.shake = Math.max(s.shake, 0.35);
    if (event.kind === "trigger" && event.event === "unlock") s.shake = Math.max(s.shake, 0.2);
  }
  const hero = world.get("player");
  if (hero) {
    s.x += (hero.x - s.x) * 0.12;
    s.y += (hero.y - s.y) * 0.12;
  }
  s.x = Math.max(${minX}, Math.min(${maxX}, s.x));
  s.y = Math.max(${minY}, Math.min(${maxY}, s.y));
  const x = s.x + (random() * 2 - 1) * s.shake;
  const y = s.y + (random() * 2 - 1) * s.shake;
  s.shake *= 0.85;
  if (s.shake < 0.01) s.shake = 0;
  return { state: s, commands: [{ kind: "setPosition", x, y }] };
}`;
}

/** Frame rectangles of a placeholder sheet, row-major, one row per animation. */
function nominalClips(slot: string): Record<string, { frames: { x: number; y: number; width: number; height: number }[]; ticksPerFrame: number; loop: boolean }> {
  const animations = ADVENTURE_SHEETS[slot] ?? { idle: 1 };
  const clips: Record<string, { frames: { x: number; y: number; width: number; height: number }[]; ticksPerFrame: number; loop: boolean }> = {};
  Object.entries(animations).forEach(([name, count], row) => {
    clips[name] = {
      frames: Array.from({ length: count }, (_, col) => ({ x: col * CELL, y: row * CELL, width: CELL, height: CELL })),
      ticksPerFrame: name === "walk" || name === "move" ? 8 : 20,
      loop: true
    };
  });
  return clips;
}

function animatorFor(slot: string, first: string) {
  const clips = nominalClips(slot);
  const clip = clips[first]!;
  return { frames: clip.frames, ticksPerFrame: clip.ticksPerFrame, loop: true, clips };
}

const placeholder = (slot: string, mediaKind?: "audio") =>
  mediaKind
    ? { assetId: `builtin:${slot}`, digest: `builtin:${slot}-v1`, mediaKind, width: 1, height: 1 }
    : { assetId: `builtin:${slot}`, digest: `builtin:${slot}-v1`, width: CELL, height: CELL };

/** Build a playable top-down adventure. */
export function createAdventureGame(id: string, options: AdventureOptions = {}): GameDocument {
  const size = options.size ?? "medium";
  const difficulty = options.difficulty ?? "normal";
  const tuning = TUNING[difficulty];
  const random = seededRandom(options.seed ?? adventureSeed(options.title ?? id));
  const layout = generateLayout(size, random);
  const { width, height, floor } = layout;
  // Tile (x, y) has its centre at world (x - width / 2 + 0.5, height / 2 - y - 0.5).
  const worldX = (x: number): number => x - width / 2 + 0.5;
  const worldY = (y: number): number => height / 2 - y - 0.5;
  const isFloor = (x: number, y: number): boolean => floor[y]?.[x] === true;

  const floorTiles: { x: number; y: number; width: number; height: number }[] = [];
  const wallTiles: { x: number; y: number; width: number; height: number }[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isFloor(x, y)) {
        floorTiles.push({ x: worldX(x), y: worldY(y), width: 1, height: 1 });
        continue;
      }
      // Solid ground fills every cell between the rooms, so no void shows on screen.
      wallTiles.push({ x: worldX(x), y: worldY(y), width: 1, height: 1 });
    }
  }

  // Free interior tiles of a room: floor on every side, so nothing blocks a doorway.
  const used = new Set<string>();
  const freeTiles = (room: Room): { x: number; y: number }[] => {
    const tiles: { x: number; y: number }[] = [];
    for (let y = room.top + 1; y < room.bottom; y += 1) {
      for (let x = room.left + 1; x < room.right; x += 1) {
        if (!used.has(`${x},${y}`)) {
          tiles.push({ x, y });
        }
      }
    }
    return tiles;
  };
  const take = (room: Room, spread = 1): { x: number; y: number } | null => {
    const tiles = freeTiles(room);
    if (tiles.length === 0) {
      return null;
    }
    const tile = tiles[Math.floor(random() * tiles.length)]!;
    for (let dy = -spread; dy <= spread; dy += 1) {
      for (let dx = -spread; dx <= spread; dx += 1) {
        used.add(`${tile.x + dx},${tile.y + dy}`);
      }
    }
    return tile;
  };

  const startTile = centerOf(layout.start);
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      used.add(`${startTile.x + dx},${startTile.y + dy}`);
    }
  }
  const exitTile = centerOf(layout.exit);
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      used.add(`${exitTile.x + dx},${exitTile.y + dy}`);
    }
  }
  const away = layout.byDistance.slice(1);

  const entities: GameEntity[] = [];
  const entity = (value: Record<string, unknown>): void => {
    entities.push(value as unknown as GameEntity);
  };

  const halfWidth = 10;
  const halfHeight = 5.625;
  const minX = -width / 2 + halfWidth;
  const maxX = width / 2 - halfWidth;
  const minY = -height / 2 + halfHeight;
  const maxY = height / 2 - halfHeight;
  const clampCamera = (low: number, high: number): [number, number] => (low > high ? [0, 0] : [low, high]);
  const [cameraMinX, cameraMaxX] = clampCamera(minX, maxX);
  const [cameraMinY, cameraMaxY] = clampCamera(minY, maxY);
  entity({
    id: "camera", name: "Camera",
    transform2d: { x: worldX(startTile.x), y: worldY(startTile.y) },
    camera2d: { width: 20, height: 11.25 },
    behaviors: [{ kind: "script", source: cameraScript(cameraMinX, cameraMaxX, cameraMinY, cameraMaxY), maxCommands: 1 }],
    particles: { emitters: [{
      id: "dust", rate: 6, maxParticles: 96, shape: { kind: "box", size: { x: 22, y: 13 } },
      lifetime: { min: 5, max: 9 }, speed: { min: 0.03, max: 0.15 }, size: { min: 0.03, max: 0.07 },
      color: { min: "#c9b48a", max: "#fff1cf" }, opacity: 0.55,
      opacityOverLifetime: [{ t: 0, value: 0 }, { t: 0.2, value: 1 }, { t: 0.8, value: 0.7 }, { t: 1, value: 0 }],
      gravity: { x: 0.01, y: 0.02 }, blend: "additive", unlit: true, layer: 9
    }] }
  });
  entity({
    id: "floor", name: "Floor", transform2d: { x: 0, y: 0 },
    tilemap: { assetId: "floor", tiles: floorTiles, layer: -10 }
  });
  entity({
    id: "walls", name: "Walls", transform2d: { x: 0, y: 0 },
    tilemap: { assetId: "wall", tiles: wallTiles, layer: -5, solid: true }
  });

  const gemCount = GRID[size].gems;
  entity({
    id: "player", name: "Player", tags: ["hero"], props: { title: options.title?.trim() || "Find every gem" },
    transform2d: { x: worldX(startTile.x), y: worldY(startTile.y) },
    sprite: { assetId: "player", width: 1.1, height: 1.1, layer: 3, frame: nominalClips("player")["idle"]!.frames[0] },
    animator: animatorFor("player", "idle"),
    body2d: { type: "kinematic" },
    collider2d: { width: 0.62, height: 0.62 },
    light2d: { color: "#ffd9a0", intensity: 1.2, radius: 5.5, falloff: 1.4 },
    behaviors: [
      {
        kind: "script", source: PLAYER_SCRIPT, maxCommands: 32,
        params: {
          speed: { type: "number", default: 4.2, minimum: 1, maximum: 12 },
          health: { type: "number", default: tuning.health, minimum: 1, maximum: 20, integer: true },
          gems: { type: "number", default: gemCount, minimum: 1, maximum: 64, integer: true }
        }
      },
      { kind: "winWhenCollected", count: 1 }
    ],
    particles: { emitters: [
      {
        id: "sparkle", playOnStart: false, loop: false, rate: 0, maxParticles: 128,
        shape: { kind: "circle", radius: 0.2 }, lifetime: { min: 0.4, max: 0.9 }, speed: { min: 1.5, max: 4 },
        size: { min: 0.06, max: 0.14 }, color: { min: "#ffd25a", max: "#fff6c8" }, drag: 2.5,
        opacityOverLifetime: [{ t: 0, value: 1 }, { t: 1, value: 0 }], blend: "additive", unlit: true, layer: 6
      },
      {
        id: "hurt", playOnStart: false, loop: false, rate: 0, maxParticles: 64,
        shape: { kind: "circle", radius: 0.2 }, lifetime: { min: 0.3, max: 0.6 }, speed: { min: 2, max: 5 },
        size: { min: 0.06, max: 0.12 }, color: { min: "#ff3b3b", max: "#ff9a7a" }, drag: 3,
        opacityOverLifetime: [{ t: 0, value: 1 }, { t: 1, value: 0 }], blend: "additive", unlit: true, layer: 6
      }
    ] }
  });

  // Gems spread over every room but the start, the far rooms first.
  for (let index = 0; index < gemCount; index += 1) {
    const room = away[index % away.length]!;
    const tile = take(room);
    if (!tile) {
      continue;
    }
    entity({
      id: `gem${index}`, name: `Gem ${index + 1}`, tags: ["gem"],
      transform2d: { x: worldX(tile.x), y: worldY(tile.y) },
      sprite: { assetId: "gem", width: 0.75, height: 0.75, layer: 2 },
      collider2d: { width: 0.6, height: 0.6, sensor: true },
      light2d: { color: "#ffcf5a", intensity: 0.9, radius: 1.8, falloff: 1.5 },
      visualAnimation: { tracks: [
        { property: "scaleX", from: 0.9, to: 1.08, durationTicks: 40 + (index % 3) * 6, repeat: true, pingPong: true, easing: "easeInOut" },
        { property: "scaleY", from: 0.9, to: 1.08, durationTicks: 40 + (index % 3) * 6, repeat: true, pingPong: true, easing: "easeInOut" }
      ] }
    });
  }
  // The real count, in case a cramped room had no free tile.
  const placedGems = entities.filter((entry) => entry.id.startsWith("gem")).length;
  const player = entities.find((entry) => entry.id === "player")!;
  const playerScript = player.behaviors[0];
  if (playerScript?.kind === "script" && playerScript.params?.["gems"]?.type === "number") {
    playerScript.params["gems"] = { ...playerScript.params["gems"], default: placedGems };
  }

  const enemyCount = Math.max(1, Math.round(away.length * tuning.enemiesPerRoom));
  for (let index = 0; index < enemyCount; index += 1) {
    const room = away[(index * 2 + 1) % away.length]!;
    const tile = take(room, 2);
    if (!tile) {
      continue;
    }
    const chase = random() < tuning.chaseShare;
    const axis = room.right - room.left >= room.bottom - room.top ? "x" : "y";
    const bounds = axis === "x"
      ? { min: worldX(room.left) + 0.5, max: worldX(room.right) - 0.5 }
      : { min: worldY(room.bottom) + 0.5, max: worldY(room.top) - 0.5 };
    const sprite: NonNullable<GameEntity["sprite"]> = { assetId: "enemy", width: 1, height: 1, layer: 3, frame: nominalClips("enemy")["idle"]!.frames[0] };
    if (chase) {
      sprite.tint = "#ffc4c4";
    }
    entity({
      id: `enemy${index}`, name: chase ? `Hunter ${index + 1}` : `Patroller ${index + 1}`, tags: ["enemy"],
      props: { axis, min: bounds.min, max: bounds.max, homeX: worldX(tile.x), homeY: worldY(tile.y) },
      transform2d: { x: worldX(tile.x), y: worldY(tile.y) },
      sprite,
      animator: animatorFor("enemy", "idle"),
      body2d: { type: "kinematic" },
      collider2d: { width: 0.7, height: 0.7 },
      behaviors: [{
        kind: "script", source: ENEMY_SCRIPT, maxCommands: 8,
        params: {
          mode: { type: "enum", options: chase ? ["chase", "patrol"] : ["patrol", "chase"] },
          speed: { type: "number", default: chase ? tuning.chaseSpeed : tuning.patrolSpeed, minimum: 0.5, maximum: 10 },
          sight: { type: "number", default: tuning.sight, minimum: 1, maximum: 20 }
        }
      }]
    });
  }

  const hazardCount = Math.round(away.length * tuning.hazardsPerRoom);
  for (let index = 0; index < hazardCount; index += 1) {
    const room = away[(index * 3) % away.length]!;
    const tile = take(room);
    if (!tile) {
      continue;
    }
    entity({
      id: `hazard${index}`, name: `Hazard ${index + 1}`, tags: ["hazard"],
      transform2d: { x: worldX(tile.x), y: worldY(tile.y) },
      sprite: { assetId: "hazard", width: 1, height: 1, layer: -2 },
      collider2d: { width: 0.7, height: 0.7, sensor: true },
      light2d: { color: "#ff5a3a", intensity: 0.7, radius: 1.5, falloff: 1.6 },
      particles: { emitters: [{
        id: "embers", rate: 3, maxParticles: 24, shape: { kind: "box", size: { x: 0.7, y: 0.5 } },
        lifetime: { min: 0.6, max: 1.2 }, speed: { min: 0.2, max: 0.6 }, size: { min: 0.03, max: 0.07 },
        color: { min: "#ff6a2a", max: "#ffc070" }, gravity: { x: 0, y: 0.8 },
        opacityOverLifetime: [{ t: 0, value: 1 }, { t: 1, value: 0 }], blend: "additive", unlit: true, layer: 4
      }] }
    });
  }

  entity({
    id: "exit", name: "Exit", tags: ["exit"],
    transform2d: { x: worldX(exitTile.x) + 0.5, y: worldY(exitTile.y) - 0.5 },
    sprite: { assetId: "exit", width: 1.8, height: 1.8, layer: -1, tint: "#8a8aa8", frame: nominalClips("exit")["closed"]!.frames[0] },
    animator: { ...animatorFor("exit", "closed"), loop: false },
    collider2d: { width: 1, height: 1, sensor: true },
    light2d: { color: "#9a7cff", intensity: 1.1, radius: 3.2, falloff: 1.4 },
    behaviors: [{ kind: "script", source: EXIT_SCRIPT, maxCommands: 4 }],
    particles: { emitters: [{
      id: "swirl", playOnStart: false, loop: true, rate: 24, maxParticles: 96,
      shape: { kind: "circle", radius: 0.9, fromEdge: true }, lifetime: { min: 0.8, max: 1.4 }, speed: { min: 0.2, max: 0.6 },
      size: { min: 0.05, max: 0.11 }, color: { min: "#b49cff", max: "#f0e8ff" }, gravity: { x: 0, y: 0.6 },
      opacityOverLifetime: [{ t: 0, value: 0 }, { t: 0.3, value: 1 }, { t: 1, value: 0 }], blend: "additive", unlit: true, layer: 5
    }] }
  });
  entity({
    id: "goal", name: "Goal (spawned at the open exit)", templateOnly: true,
    transform2d: { x: 0, y: 0 },
    collider2d: { width: 0.4, height: 0.4, sensor: true },
    behaviors: [{ kind: "collectible", score: 1 }]
  });
  entity({ id: "sound-gem", name: "Gem sound", transform2d: { x: 0, y: 0 }, behaviors: [],
    audioSource: { assetId: "sfx.collect", onEvent: "gem", volume: 0.7 } });
  entity({ id: "sound-hurt", name: "Hurt sound", transform2d: { x: 0, y: 0 }, behaviors: [],
    audioSource: { assetId: "sfx.hurt", onEvent: "hurt", volume: 0.8 } });
  entity({ id: "sound-unlock", name: "Exit sound", transform2d: { x: 0, y: 0 }, behaviors: [],
    audioSource: { assetId: "sfx.collect", onEvent: "unlock", volume: 1 } });

  const ui = {
    nodes: [
      { kind: "panel", id: "hud-panel", anchor: { x: 0, y: 0 }, offset: { x: 20, y: 20 }, width: 300, height: 92, color: "#0b0d18", opacity: 0.72, cornerRadius: 16 },
      { kind: "text", id: "hud-health-label", anchor: { x: 0, y: 0 }, offset: { x: 38, y: 32 }, text: "Health", size: 18, color: "#c9d1ff" },
      { kind: "bar", id: "hud-health", anchor: { x: 0, y: 0 }, offset: { x: 38, y: 62 }, width: 150, height: 16, value: tuning.health, max: tuning.health, color: "#ff5a6e", background: "#3a2030" },
      { kind: "text", id: "hud-gems-label", anchor: { x: 0, y: 0 }, offset: { x: 214, y: 32 }, text: "Gems", size: 18, color: "#ffe39a" },
      { kind: "text", id: "hud-gems", anchor: { x: 0, y: 0 }, offset: { x: 214, y: 54 }, text: `0 / ${placedGems}`, size: 26, color: "#ffffff" },
      { kind: "text", id: "hud-goal", anchor: { x: 0.5, y: 1 }, offset: { x: 0, y: -26 }, text: "Collect every gem, then reach the exit.", size: 20, color: "#e8e4ff", align: "center" },
      { kind: "text", id: "hud-note", anchor: { x: 0.5, y: 0.5 }, offset: { x: 0, y: 96 }, text: "", size: 40, color: "#ffffff", align: "center", visible: false }
    ]
  };

  return gameDocument.parse({
    schemaVersion: 4,
    engineVersion: "3",
    id,
    revision: "adventure-v1",
    entrySceneId: ADVENTURE_SCENE_ID,
    pixelsPerUnit: CELL,
    tickRate: 60,
    inputActions: ["left", "right", "up", "down"],
    renderEffects: [{ kind: "bloom", threshold: 0.72, softness: 0.25, radius: 12, intensity: 0.6, required: false }],
    assets: {
      player: placeholder("player"),
      enemy: placeholder("enemy"),
      gem: placeholder("gem"),
      hazard: placeholder("hazard"),
      exit: placeholder("exit"),
      floor: placeholder("floor"),
      wall: placeholder("wall"),
      "sfx.collect": placeholder("sfx.collect", "audio"),
      "sfx.hurt": placeholder("sfx.hurt", "audio")
    },
    scenes: [{
      id: ADVENTURE_SCENE_ID,
      name: options.title?.trim() || "Adventure",
      lighting: { ambient: { color: "#6a74a0", intensity: 0.62 }, points: [] },
      ui,
      entities
    }]
  });
}

type Frame = { x: number; y: number; width: number; height: number };

/** Edge bits of a wall tile that faces floor, as the tileset preparation numbers them. */
function wallMask(tile: { x: number; y: number }, floorAt: Set<string>): number {
  const key = (x: number, y: number) => `${x},${y}`;
  return (floorAt.has(key(tile.x, tile.y + 1)) ? 1 : 0) |
    (floorAt.has(key(tile.x + 1, tile.y)) ? 2 : 0) |
    (floorAt.has(key(tile.x, tile.y - 1)) ? 4 : 0) |
    (floorAt.has(key(tile.x - 1, tile.y)) ? 8 : 0);
}

/**
 * Point an adventure's sprites, animations and wall tiles at the art the flow
 * generated, and play the level music when a track was generated. A slot that
 * still holds its `builtin:` placeholder is left as it is.
 */
export function bindAdventureArt(document: GameDocument): GameDocument {
  const next = structuredClone(document);
  const generated = (slot: string): boolean => {
    const binding = next.assets[slot];
    return binding !== undefined && !binding.assetId.startsWith("builtin:");
  };
  const clipsBySlot = new Map<string, Record<string, { frames: Frame[]; ticksPerFrame: number; loop: boolean }>>();
  for (const [slot, animations] of Object.entries(ADVENTURE_SHEETS)) {
    if (!generated(slot)) {
      continue;
    }
    const clips: Record<string, { frames: Frame[]; ticksPerFrame: number; loop: boolean }> = {};
    let complete = true;
    // The sheet prompt fills frames row-major with no gaps, one animation after another.
    let index = 0;
    Object.entries(animations).forEach(([name, count]) => {
      const frames: Frame[] = [];
      for (let offset = 0; offset < count; offset += 1, index += 1) {
        const frame = next.assets[`${slot}.frame.${index}`]?.frame;
        if (!frame) {
          complete = false;
          return;
        }
        frames.push(frame);
      }
      clips[name] = { frames, ticksPerFrame: name === "walk" || name === "move" ? 8 : 20, loop: true };
    });
    if (complete) {
      clipsBySlot.set(slot, clips);
    }
  }
  const floorAt = new Set<string>();
  for (const scene of next.scenes) {
    for (const entity of scene.entities) {
      if (entity.id === "floor" && entity.tilemap) {
        for (const tile of entity.tilemap.tiles) {
          floorAt.add(`${tile.x},${tile.y}`);
        }
      }
    }
  }
  for (const scene of next.scenes) {
    for (const entity of scene.entities) {
      const sprite = entity.sprite;
      const clips = sprite ? clipsBySlot.get(sprite.assetId) : undefined;
      if (sprite && clips) {
        const names = Object.keys(clips);
        const first = clips[names[0]!]!;
        sprite.frame = first.frames[0];
        if (entity.animator || first.frames.length > 1) {
          entity.animator = { frames: first.frames, ticksPerFrame: first.ticksPerFrame, loop: entity.animator?.loop ?? true, clips };
        }
      }
      if (entity.id === "walls" && entity.tilemap && generated("wall") && next.assets["wall.tile.0"]?.frame) {
        for (const tile of entity.tilemap.tiles) {
          const frame = next.assets[`wall.tile.${wallMask(tile, floorAt)}`]?.frame;
          if (frame) {
            tile.frame = frame;
          }
        }
      }
    }
    if (scene.id === ADVENTURE_SCENE_ID && generated("music.level") && !scene.music) {
      scene.music = { assetId: "music.level", volume: 0.55, fadeInTicks: 90, fadeOutTicks: 60 };
    }
  }
  return gameDocument.parse(next);
}
