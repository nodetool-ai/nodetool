// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { DataframeRef } from "../types.js";

// SQLite Skill — skills.data.SQLiteSkill
export interface SQLiteSkillInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
  db_path?: Connectable<string>;
  allow_mutation?: Connectable<boolean>;
}

export interface SQLiteSkillOutputs {
  text: string;
  json: Record<string, unknown>;
  dataframe: DataframeRef;
}

export function sqLiteSkill(inputs: SQLiteSkillInputs): DslNode<SQLiteSkillOutputs> {
  return createNode("skills.data.SQLiteSkill", inputs as Record<string, unknown>, { outputNames: ["text", "json", "dataframe"] });
}

// Supabase Skill — skills.data.SupabaseSkill
export interface SupabaseSkillInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  timeout_seconds?: Connectable<number>;
  max_output_chars?: Connectable<number>;
}

export interface SupabaseSkillOutputs {
  text: string;
  json: Record<string, unknown>;
  dataframe: DataframeRef;
}

export function supabaseSkill(inputs: SupabaseSkillInputs): DslNode<SupabaseSkillOutputs> {
  return createNode("skills.data.SupabaseSkill", inputs as Record<string, unknown>, { outputNames: ["text", "json", "dataframe"] });
}
