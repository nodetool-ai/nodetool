/**
 * The Markdown transformers of the document editor: Lexical's set plus task
 * lists, images, horizontal rules and pipe tables. The same list drives
 * import, export and the typing shortcuts, so a shortcut can never produce a
 * node that does not save.
 */
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  CHECK_LIST,
  isTableRowDivider,
  TEXT_FORMAT_TRANSFORMERS,
  TEXT_MATCH_TRANSFORMERS,
  TRANSFORMERS,
  type ElementTransformer,
  type MultilineElementTransformer,
  type TextMatchTransformer,
  type Transformer
} from "@lexical/markdown";
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellHeaderStates,
  TableCellNode,
  TableNode,
  TableRowNode
} from "@lexical/table";
import type { ElementNode, LexicalNode } from "lexical";

import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode
} from "../textEditor/HorizontalRuleNode";
import {
  $createDocumentImageNode,
  $isDocumentImageNode,
  DocumentImageNode
} from "./nodes/DocumentImageNode";

/** Escape the characters that end or escape image alt text. */
const escapeAlt = (text: string): string => text.replace(/([\\[\]])/g, "\\$1");

export const IMAGE: TextMatchTransformer = {
  dependencies: [DocumentImageNode],
  export: (node) => {
    if (!$isDocumentImageNode(node)) {
      return null;
    }
    const title = node.getTitle();
    return `![${escapeAlt(node.getAlt())}](${node.getSrc()}${title ? ` "${title}"` : ""})`;
  },
  importRegExp: /!\[((?:\\.|[^\]\\])*)\]\(([^()\s]+)(?:\s+"([^"]*)")?\)/,
  regExp: /!\[((?:\\.|[^\]\\])*)\]\(([^()\s]+)(?:\s+"([^"]*)")?\)$/,
  replace: (textNode, match) => {
    const [, alt, src, title] = match;
    textNode.replace(
      $createDocumentImageNode(src, alt.replace(/\\([\\[\]])/g, "$1"), title ?? "")
    );
  },
  trigger: ")",
  type: "text-match"
};

export const HORIZONTAL_RULE: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node) => ($isHorizontalRuleNode(node) ? "---" : null),
  regExp: /^(?:---|\*\*\*|___)\s?$/,
  replace: (parentNode, _children, _match, isImport) => {
    const rule = $createHorizontalRuleNode();
    if (isImport || parentNode.getNextSibling() !== null) {
      parentNode.replace(rule);
    } else {
      parentNode.insertBefore(rule);
    }
    rule.selectNext();
  },
  type: "element"
};

const TABLE_ROW = /^ {0,3}\|(.*)\|[ \t]*$/;

/** The cells of one `| a | b |` row, split on unescaped pipes. */
function tableCells(line: string): string[] {
  const match = TABLE_ROW.exec(line);
  if (!match) {
    return [];
  }
  const cells: string[] = [];
  let current = "";
  const body = match[1];
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if (char === "\\" && body[index + 1] === "|") {
      current += "\\|";
      index++;
    } else if (char === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** Inline formats only: a table cell holds one line. */
const CELL_TRANSFORMERS: Transformer[] = [
  ...TEXT_FORMAT_TRANSFORMERS,
  ...TEXT_MATCH_TRANSFORMERS
];

function $createCell(markdown: string, header: boolean): TableCellNode {
  const cell = $createTableCellNode(
    header ? TableCellHeaderStates.ROW : TableCellHeaderStates.NO_STATUS
  );
  // Undo the export's escape: 2k+1 backslashes and a pipe are k and a pipe.
  const content = markdown.replace(/(\\+)\|/g, (_match, run: string) =>
    `${"\\".repeat(Math.floor((run.length - 1) / 2))}|`
  );
  $convertFromMarkdownString(content, [IMAGE, ...CELL_TRANSFORMERS], cell);
  return cell;
}

function exportCell(cell: ElementNode): string {
  return $convertToMarkdownString([IMAGE, ...CELL_TRANSFORMERS], cell)
    .replace(/\n+/g, " ")
    // A pipe ends the cell: escape it, doubling the backslashes before it.
    .replace(/(\\*)\|/g, (_match, run: string) => `${run}${run}\\|`);
}

export const TABLE: MultilineElementTransformer = {
  dependencies: [TableNode, TableRowNode, TableCellNode],
  export: (node: LexicalNode) => {
    if (!$isTableNode(node)) {
      return null;
    }
    const rows = node.getChildren().filter($isTableRowNode);
    const lines: string[] = [];
    rows.forEach((row, index) => {
      const cells = row.getChildren().filter($isTableCellNode);
      lines.push(`| ${cells.map(exportCell).join(" | ")} |`);
      if (index === 0) {
        lines.push(`| ${cells.map(() => "---").join(" | ")} |`);
      }
    });
    return lines.join("\n");
  },
  regExpStart: TABLE_ROW,
  handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex }) => {
    let end = startLineIndex;
    while (end + 1 < lines.length && TABLE_ROW.test(lines[end + 1])) {
      end++;
    }
    const rowLines = lines.slice(startLineIndex, end + 1);
    const hasHeader = rowLines.length > 1 && isTableRowDivider(rowLines[1]);
    const table = $createTableNode();
    rowLines.forEach((line, index) => {
      if (hasHeader && index === 1) {
        return;
      }
      const row = $createTableRowNode();
      for (const cell of tableCells(line)) {
        row.append($createCell(cell, hasHeader && index === 0));
      }
      table.append(row);
    });
    rootNode.append(table);
    return [true, end];
  },
  replace: () => false,
  type: "multiline-element"
};

/** Every transformer, in priority order: tasks before bullets, images before links. */
export const DOCUMENT_TRANSFORMERS: Transformer[] = [
  TABLE,
  HORIZONTAL_RULE,
  CHECK_LIST,
  IMAGE,
  ...TRANSFORMERS
];
