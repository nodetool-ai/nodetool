import { and, desc, eq } from "drizzle-orm";
import {
  DBModel,
  ModelChangeEvent,
  ModelChangeMeta,
  ModelObserver,
  createTimeOrderedUuid
} from "./base-model.js";
import { getDb } from "./db.js";
import { skills } from "./schema/skills.js";
import { isValidSkillDescription, isValidSkillName } from "@nodetool-ai/protocol";

export interface SkillResponse {
  id: string;
  name: string;
  description: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillListItem {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
}

export class SkillConflictError extends Error {
  constructor(id: string) {
    super(`Skill ${id} was modified concurrently`);
    this.name = "SkillConflictError";
  }
}

function nextUpdatedAtAfter(previous: string): string {
  const now = new Date();
  const previousMs = Date.parse(previous);
  if (Number.isFinite(previousMs) && now.getTime() <= previousMs) {
    return new Date(previousMs + 1).toISOString();
  }
  return now.toISOString();
}

function assertValidSkillFields(fields: {
  name?: string;
  description?: string;
  content?: string;
}): void {
  if (fields.name !== undefined && !isValidSkillName(fields.name)) {
    throw new Error(
      `Invalid skill name "${fields.name}": must be 1-64 chars, lowercase a-z0-9- only, and not contain reserved terms`
    );
  }
  if (
    fields.description !== undefined &&
    !isValidSkillDescription(fields.description)
  ) {
    throw new Error(
      `Invalid skill description: must be 1-1024 chars and not contain XML tags`
    );
  }
  if (fields.content !== undefined && !fields.content.trim()) {
    throw new Error("Skill content must not be empty");
  }
}

export class Skill extends DBModel {
  static override table = skills;

  declare id: string;
  declare user_id: string;
  declare name: string;
  declare description: string;
  declare content: string;
  declare created_at: string;
  declare updated_at: string;

  constructor(data: Record<string, unknown>) {
    super(data);
    const now = new Date().toISOString();
    this.id ??= createTimeOrderedUuid();
    this.name ??= "";
    this.description ??= "Custom skill";
    this.content ??= "";
    this.created_at ??= now;
    this.updated_at ??= now;
  }

  override beforeSave(): void {
    this.updated_at = nextUpdatedAtAfter(this.updated_at);
    assertValidSkillFields({
      name: this.name,
      description: this.description,
      content: this.content
    });
  }

  toResponse(): SkillResponse {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      content: this.content,
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  }

  toListItem(): SkillListItem {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      updatedAt: this.updated_at
    };
  }

  static async findById(id: string): Promise<Skill | null> {
    return Skill.get<Skill>(id);
  }

  static async findByName(
    userId: string,
    name: string
  ): Promise<Skill | null> {
    const db = getDb();
    const [row] = await db
      .select()
      .from(skills)
      .where(and(eq(skills.user_id, userId), eq(skills.name, name)))
      .limit(1);
    return row ? new Skill(row as Record<string, unknown>) : null;
  }

  static async listByUser(
    userId: string,
    limit = 100
  ): Promise<Skill[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(skills)
      .where(eq(skills.user_id, userId))
      .orderBy(desc(skills.updated_at))
      .limit(limit);
    return rows.map((r: Record<string, unknown>) => new Skill(r));
  }

  static async deleteOwned(userId: string, id: string): Promise<boolean> {
    const row = await Skill.findById(id);
    if (!row || row.user_id !== userId) return false;
    await row.delete();
    return true;
  }

  static async updateFieldsIfUnchanged(
    id: string,
    expectedUpdatedAt: string,
    fields: Partial<{
      name: string;
      description: string;
      content: string;
    }>,
    meta?: ModelChangeMeta
  ): Promise<Skill | null> {
    if (
      fields.name !== undefined ||
      fields.description !== undefined ||
      fields.content !== undefined
    ) {
      assertValidSkillFields(fields);
    }
    const db = getDb();
    const now = nextUpdatedAtAfter(expectedUpdatedAt);
    const rows = await db
      .update(skills)
      .set({ ...fields, updated_at: now })
      .where(and(eq(skills.id, id), eq(skills.updated_at, expectedUpdatedAt)))
      .returning();
    const row = rows[0];
    if (!row) return null;
    const updated = new Skill(row as Record<string, unknown>);
    ModelObserver.notify(updated, ModelChangeEvent.UPDATED, meta);
    return updated;
  }
}
