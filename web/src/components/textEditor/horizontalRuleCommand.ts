import { createCommand, type LexicalCommand } from "lexical";

export const INSERT_HORIZONTAL_RULE_COMMAND: LexicalCommand<void> =
  createCommand("INSERT_HORIZONTAL_RULE_COMMAND");
