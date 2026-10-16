import type { ComponentType } from "react";
import type { AnyGameDocument } from "@nodetool-ai/protocol";
import type { GameValidationIssue } from "@nodetool-ai/game-runtime";
import type { FieldSchema } from "./schemaForm";
import ParticleEditor from "./editors/ParticleEditor";

export interface GameComponentEditorProps {
  readonly schema: FieldSchema;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  readonly path: string;
  readonly issuePath: readonly (string | number)[];
  readonly issues: readonly GameValidationIssue[];
  readonly assets?: AnyGameDocument["assets"];
  readonly dimension: "2d" | "3d";
}

export type GameComponentEditor = ComponentType<GameComponentEditorProps>;
export type GameComponentEditors = Readonly<Partial<Record<string, GameComponentEditor>>>;

export const GAME_COMPONENT_EDITORS: GameComponentEditors = { particles: ParticleEditor };
