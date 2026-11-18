import { useProjects } from "./useProjects";

/**
 * The folder of one project, read from the project list the rest of the app
 * already caches. The Files section browses `folder.workspace_id`, so what it
 * shows follows the selected project and nothing else.
 *
 * `folder` is null while the projects load and for a project that has no
 * folder yet.
 */
export const useProjectFolder = (projectId: string) => {
  const { data, isLoading } = useProjects();
  const project = data?.find((entry) => entry.id === projectId);
  return {
    folder: project?.folder ?? null,
    projectName: project?.name ?? null,
    isLoading
  };
};
