// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Notion Search — lib.notion.Search
export interface SearchInputs {
  query?: Connectable<string>;
  filter_type?: Connectable<string>;
  sort_direction?: Connectable<string>;
  page_size?: Connectable<number>;
}

export interface SearchOutputs {
  result: Record<string, unknown>;
  results: unknown[];
}

export function search(inputs: SearchInputs): DslNode<SearchOutputs> {
  return createNode("lib.notion.Search", inputs as Record<string, unknown>, { outputNames: ["result", "results"], streaming: true });
}

// Notion Get Page — lib.notion.GetPage
export interface GetPageInputs {
  page_id?: Connectable<string>;
}

export interface GetPageOutputs {
  output: Record<string, unknown>;
}

export function getPage(inputs: GetPageInputs): DslNode<GetPageOutputs, "output"> {
  return createNode("lib.notion.GetPage", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Notion Get Page Content — lib.notion.GetPageContent
export interface GetPageContentInputs {
  page_id?: Connectable<string>;
  page_size?: Connectable<number>;
}

export interface GetPageContentOutputs {
  block: Record<string, unknown>;
  blocks: unknown[];
}

export function getPageContent(inputs: GetPageContentInputs): DslNode<GetPageContentOutputs> {
  return createNode("lib.notion.GetPageContent", inputs as Record<string, unknown>, { outputNames: ["block", "blocks"], streaming: true });
}

// Notion Create Page — lib.notion.CreatePage
export interface CreatePageInputs {
  parent_id?: Connectable<string>;
  parent_type?: Connectable<string>;
  title?: Connectable<string>;
  title_property?: Connectable<string>;
  properties_json?: Connectable<string>;
  content_json?: Connectable<string>;
}

export interface CreatePageOutputs {
  output: Record<string, unknown>;
}

export function createPage(inputs: CreatePageInputs): DslNode<CreatePageOutputs, "output"> {
  return createNode("lib.notion.CreatePage", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Notion Update Page — lib.notion.UpdatePage
export interface UpdatePageInputs {
  page_id?: Connectable<string>;
  properties_json?: Connectable<string>;
  archived?: Connectable<boolean>;
}

export interface UpdatePageOutputs {
  output: Record<string, unknown>;
}

export function updatePage(inputs: UpdatePageInputs): DslNode<UpdatePageOutputs, "output"> {
  return createNode("lib.notion.UpdatePage", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Notion Query Database — lib.notion.QueryDatabase
export interface QueryDatabaseInputs {
  database_id?: Connectable<string>;
  filter_json?: Connectable<string>;
  sort_json?: Connectable<string>;
  page_size?: Connectable<number>;
}

export interface QueryDatabaseOutputs {
  result: Record<string, unknown>;
  results: unknown[];
}

export function queryDatabase(inputs: QueryDatabaseInputs): DslNode<QueryDatabaseOutputs> {
  return createNode("lib.notion.QueryDatabase", inputs as Record<string, unknown>, { outputNames: ["result", "results"], streaming: true });
}
