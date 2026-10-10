export type GameConsoleLevel = "error" | "warning" | "log";
export type GameConsoleSource = "runtime" | "script" | "diagnostic" | "validation";

export const GAME_CONSOLE_LEVELS: readonly GameConsoleLevel[] = ["error", "warning", "log"];

/** One line written to the editor console. Console lines are editor presentation data and never enter a document or snapshot. */
export interface GameConsoleEntry {
  readonly level: GameConsoleLevel;
  readonly source: GameConsoleSource;
  readonly message: string;
  readonly tick?: number;
  readonly sceneId?: string;
  readonly entityId?: string;
}

/** A console line plus the identical lines that followed it directly. */
export interface GameConsoleGroup extends GameConsoleEntry {
  readonly id: number;
  readonly count: number;
  readonly firstTick?: number;
}

export interface GameConsoleFilter {
  readonly levels: ReadonlySet<GameConsoleLevel>;
  readonly query: string;
}

export const GAME_CONSOLE_LIMIT = 500;

function sameLine(left: GameConsoleEntry, right: GameConsoleEntry): boolean {
  return left.level === right.level && left.source === right.source && left.message === right.message
    && left.sceneId === right.sceneId && left.entityId === right.entityId;
}

/**
 * Appends a line. A line identical to the newest one (same level, source, message, scene and entity) collapses
 * into it: the count grows and the tick moves to the latest repeat. The oldest groups drop past `limit`.
 */
export function appendGameConsoleEntry(groups: readonly GameConsoleGroup[], entry: GameConsoleEntry, nextId: number,
  limit = GAME_CONSOLE_LIMIT): readonly GameConsoleGroup[] {
  const last = groups.at(-1);
  if (last && sameLine(last, entry)) {
    const merged: GameConsoleGroup = { ...last, count: last.count + 1, tick: entry.tick ?? last.tick };
    return [...groups.slice(0, -1), merged];
  }
  const group: GameConsoleGroup = { ...entry, id: nextId, count: 1, firstTick: entry.tick };
  const next = [...groups, group];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export function filterGameConsoleGroups(groups: readonly GameConsoleGroup[], filter: GameConsoleFilter,
  entityLabel: (group: GameConsoleGroup) => string | undefined = () => undefined): readonly GameConsoleGroup[] {
  const query = filter.query.trim().toLowerCase();
  return groups.filter((group) => filter.levels.has(group.level) && (!query
    || group.message.toLowerCase().includes(query)
    || (group.entityId?.toLowerCase().includes(query) ?? false)
    || (entityLabel(group)?.toLowerCase().includes(query) ?? false)));
}

export function countGameConsoleLevels(groups: readonly GameConsoleGroup[]): Readonly<Record<GameConsoleLevel, number>> {
  const counts: Record<GameConsoleLevel, number> = { error: 0, warning: 0, log: 0 };
  for (const group of groups) { counts[group.level] += group.count; }
  return counts;
}

interface ConsoleDocument {
  readonly scenes: readonly { readonly id: string; readonly entities: readonly { readonly id: string }[] }[];
}

/** Turns document validation issues into error lines, linking each to the entity its path points at. Every issue makes the document invalid. */
export function gameValidationConsoleEntries(issues: readonly { readonly path: readonly (string | number)[]; readonly message: string }[],
  document: ConsoleDocument): readonly GameConsoleEntry[] {
  return issues.map((issue) => {
    const [root, sceneIndex, child, entityIndex] = issue.path;
    const scene = root === "scenes" && typeof sceneIndex === "number" ? document.scenes[sceneIndex] : undefined;
    const entity = scene && child === "entities" && typeof entityIndex === "number" ? scene.entities[entityIndex] : undefined;
    const where = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    const entry: { -readonly [Key in keyof GameConsoleEntry]: GameConsoleEntry[Key] } = { level: "error", source: "validation", message: `${where}${issue.message}` };
    if (scene) { entry.sceneId = scene.id; }
    if (entity) { entry.entityId = entity.id; }
    return entry;
  });
}

/** Finds the scene that holds an entity, preferring the line's own scene when it still holds that entity. */
export function gameConsoleEntityScene(document: ConsoleDocument, entityId: string, sceneId?: string): string | undefined {
  const own = document.scenes.find((scene) => scene.id === sceneId && scene.entities.some((entity) => entity.id === entityId));
  return (own ?? document.scenes.find((scene) => scene.entities.some((entity) => entity.id === entityId)))?.id;
}
