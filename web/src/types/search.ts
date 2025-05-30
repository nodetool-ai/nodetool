import { Workflow } from "../stores/ApiTypes";

export interface SearchResult {
  workflow: Workflow;
  fuseScore: number;
  matches: {
    text: string;
  }[];
}
