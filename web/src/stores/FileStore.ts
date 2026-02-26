import { create } from "zustand";
import { client } from "./ApiClient";
import { createErrorMessage } from "../utils/errorHandling";
import { FileInfo } from "./ApiTypes";

interface TreeViewItem {
  id: string;
  label: string;
  children?: TreeViewItem[];
}

const MAX_TREE_DEPTH = 4;
const MAX_TREE_NODES = 5000;

const fetchDirectoryContents = async (
  path: string,
  signal?: AbortSignal
): Promise<FileInfo[]> => {
  const { data, error } = await client.GET("/api/files/list", {
    params: { query: { path } },
    signal
  });

  if (error) {
    throw createErrorMessage(error, "Failed to list files");
  }

  return data;
};

const fileToTreeItem = (file: FileInfo): TreeViewItem => ({
  id: file.path,
  label: file.name
});

const partitionDirectories = (files: FileInfo[]): [FileInfo[], FileInfo[]] => {
  const dirs: FileInfo[] = [];
  const nonDirs: FileInfo[] = [];
  for (const file of files) {
    if (file.is_dir) {
      dirs.push(file);
    } else {
      nonDirs.push(file);
    }
  }
  return [dirs, nonDirs];
};

interface FileStore {
  fileTree: TreeViewItem[];
  isLoadingTree: boolean;
  fileTreeAbortController: AbortController | null;
  cancelFileTree: () => void;

  listFiles: (path?: string) => Promise<FileInfo[]>;
  fetchFileTree: (path?: string) => Promise<TreeViewItem[]>;
}

export const useFileStore = create<FileStore>((set, get) => ({
  files: [],
  isLoading: false,
  error: null,
  fileTree: [],
  isLoadingTree: false,
  fileTreeAbortController: null,

  cancelFileTree: () => {
    const controller = get().fileTreeAbortController;
    if (controller) {
      controller.abort();
      set({ fileTreeAbortController: null, isLoadingTree: false });
    }
  },

  listFiles: async (path) => {
    const { data, error } = await client.GET("/api/files/list", {
      params: {
        query: { path }
      }
    });

    if (error) {
      throw createErrorMessage(error, "Failed to list files");
    }

    return data;
  },

  fetchFileTree: async (path = "~") => {
    // Cancel any in-flight fetch and start a fresh controller
    get().cancelFileTree();
    const abortController = new AbortController();
    set({ isLoadingTree: true, fileTreeAbortController: abortController });

    try {
      const buildTreeRecursively = async (
        currentPath: string,
        depth: number,
        budget: { remaining: number },
        visited: Set<string>
      ): Promise<TreeViewItem[]> => {
        if (depth > MAX_TREE_DEPTH || budget.remaining <= 0) {
          return [];
        }

        // Avoid cycles if backend returns symlinks pointing upward.
        if (visited.has(currentPath)) {
          return [];
        }
        visited.add(currentPath);

        const files = await fetchDirectoryContents(
          currentPath,
          abortController.signal
        );
        const [directories, nonDirectories] = partitionDirectories(files);

        const fileItems: TreeViewItem[] = [];
        for (const file of nonDirectories) {
          if (budget.remaining <= 0) {break;}
          budget.remaining -= 1;
          fileItems.push(fileToTreeItem(file));
        }

        const dirsToProcess: FileInfo[] = [];
        for (const dir of directories) {
          if (budget.remaining <= 0) {break;}
          budget.remaining -= 1;
          dirsToProcess.push(dir);
        }

        const dirItems: TreeViewItem[] = await Promise.all(
          dirsToProcess.map(async (dir) => {
            const children = await buildTreeRecursively(
              dir.path,
              depth + 1,
              budget,
              visited
            );
            return {
              ...fileToTreeItem(dir),
              children
            };
          })
        );

        // Combine and return all items
        return [...dirItems, ...fileItems];
      };

      const tree = await buildTreeRecursively(
        path,
        0,
        { remaining: MAX_TREE_NODES },
        new Set()
      );
      if (!abortController.signal.aborted) {
        set({ fileTree: tree, isLoadingTree: false });
      }
      return tree;
    } catch (error) {
      if (!abortController.signal.aborted) {
        set({ isLoadingTree: false });
        throw error;
      }
      return [];
    } finally {
      if (get().fileTreeAbortController === abortController) {
        set({ fileTreeAbortController: null });
      }
    }
  }
}));
