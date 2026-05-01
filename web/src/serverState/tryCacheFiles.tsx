import { trpc } from "../lib/trpc";

export interface RepoPathInput {
  repo_id?: string;
  path?: string;
}

export const tryCacheFiles = async (files: RepoPathInput[]) => {
  return trpc.models.huggingfaceTryCacheFiles.mutate(files);
};

export const tryCacheRepos = async (repos: string[]) => {
  return trpc.models.huggingfaceTryCacheRepos.mutate(repos);
};
