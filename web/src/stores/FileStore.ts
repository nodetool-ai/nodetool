import { create } from "zustand";
import { client } from "./ApiClient";
import { createErrorMessage } from "../utils/errorHandling";
import { FileInfo } from "./ApiTypes";

interface TreeViewItem {
  id: string;
  label: string;
  children?: TreeViewItem[];
}

const fetchDirectoryContents = async (path: string): Promise<FileInfo[]> => {
  const { data, error } = await client.GET("/api/files/list", {
    params: { query: { path } }
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

const partitionDirectories = (files: FileInfo[]): [FileInfo[], FileInfo[]] =>
  files.reduce<[FileInfo[], FileInfo[]]>(
    ([dirs, files], item) =>
      item.is_dir ? [[...dirs, item], files] : [dirs, [...files, item]],
    [[], []]
  );

interface FileStore {
  fileTree: TreeViewItem[];
  isLoadingTree: boolean;

  listFiles: (path?: string) => Promise<FileInfo[]>;
  fetchFileTree: (path?: string) => Promise<TreeViewItem[]>;
}

export const useFileStore = create<FileStore>((set, get) => ({
  files: [],
  isLoading: false,
  error: null,
  fileTree: [],
  isLoadingTree: false,

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
    set({ isLoadingTree: true });

    try {
      const buildTreeRecursively = async (
        currentPath: string
      ): Promise<TreeViewItem[]> => {
        const files = await fetchDirectoryContents(currentPath);
        const [directories, nonDirectories] = partitionDirectories(files);

        // Convert regular files to tree items
        const fileItems = nonDirectories.map(fileToTreeItem);

        // Process directories in parallel and convert to tree items
        const dirItems = await Promise.all(
          directories.map(async (dir) => ({
            ...fileToTreeItem(dir),
            children: await buildTreeRecursively(dir.path)
          }))
        );

        // Combine and return all items
        return [...dirItems, ...fileItems];
      };

      const tree = await buildTreeRecursively(path);
      set({ fileTree: tree, isLoadingTree: false });
      return tree;
    } catch (error) {
      set({ isLoadingTree: false });
      throw error;
    }
  }
}));
