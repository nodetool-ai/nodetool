import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";

export const useCollectionDragAndDrop = (isElectron: boolean) => {
  const queryClient = useQueryClient();
  const [dragOverCollection, setDragOverCollection] = useState<string | null>(
    null
  );
  const [indexProgress, setIndexProgress] = useState<{
    collection: string;
    current: number;
    total: number;
    startTime: number;
  } | null>(null);
  const [indexErrors, setIndexErrors] = useState<
    { file: string; error: string }[]
  >([]);

  const handleDrop = useCallback(
    (collectionName: string) =>
      async (event: React.DragEvent<HTMLDivElement>) => {
        if (!isElectron) return;
        event.preventDefault();
        setDragOverCollection(null);
        const files = Array.from(event.dataTransfer.files).map((file) => ({
          // @ts-expect-error - Electron's File object includes a 'path' property
          path: file.path,
          mime_type: file.type
        }));

        setIndexProgress({
          collection: collectionName,
          current: 0,
          total: files.length,
          startTime: Date.now()
        });

        const errors: { file: string; error: string }[] = [];
        let completed = 0;

        const chunkSize = 2;
        for (let i = 0; i < files.length; i += chunkSize) {
          const chunk = files.slice(i, i + chunkSize);
          try {
            await Promise.all(
              chunk.map(async (file) => {
                try {
                  const { data, error } = await client.POST(
                    "/api/collections/{name}/index",
                    {
                      params: {
                        path: { name: collectionName }
                      },
                      body: file
                    }
                  );
                  if (error || data?.error) {
                    errors.push({
                      file: file.path,
                      error:
                        error?.detail?.[0]?.msg ||
                        data?.error ||
                        "Unknown error"
                    });
                  }
                } catch (error: any) {
                  console.error("Failed to index file:", error);
                  errors.push({
                    file: file.path,
                    error: String(error)
                  });
                } finally {
                  completed++;
                  queryClient.invalidateQueries({ queryKey: ["collections"] });
                  setIndexProgress((prev) =>
                    prev
                      ? {
                          ...prev,
                          current: completed
                        }
                      : null
                  );
                }
              })
            );
          } catch (error) {
            console.error("Chunk processing error:", error);
          }
        }

        setIndexProgress(null);
        setIndexErrors(errors);
      },
    [isElectron, queryClient]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent, collectionName: string) => {
      if (!isElectron) return;
      event.preventDefault();
      setDragOverCollection(collectionName);
    },
    [isElectron]
  );

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setDragOverCollection(null);
  }, []);

  return {
    dragOverCollection,
    indexProgress,
    indexErrors,
    setIndexErrors,
    handleDrop,
    handleDragOver,
    handleDragLeave
  };
};
