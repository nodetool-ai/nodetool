import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";

// Define a type for the expected error structure from the API
interface ApiErrorDetail {
  loc: string[];
  msg: string;
  type: string;
}

interface ApiError {
  detail?: ApiErrorDetail[];
}

interface IndexResponseData {
  path: string;
  error?: string | null;
}

export const useCollectionDragAndDrop = () => {
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
        event.preventDefault();
        setDragOverCollection(null);
        setIndexErrors([]); // Clear previous errors

        // Use File objects directly from the event
        const files = Array.from(event.dataTransfer.files);

        if (files.length === 0) return;

        setIndexProgress({
          collection: collectionName,
          current: 0,
          total: files.length,
          startTime: Date.now()
        });

        const errors: { file: string; error: string }[] = [];
        let completed = 0;

        // Process each file individually
        for (const file of files) {
          const formData = new FormData();
          formData.append("file", file);

          try {
            // Prepare options object separately to bypass strict body typing
            const requestOptions: any = {
              params: {
                path: { name: collectionName }
              },
              body: formData
              // Content-Type is set automatically for FormData
            };

            const { data, error } = await client.POST(
              "/api/collections/{name}/index",
              requestOptions
            );

            // Type assertion for error structure
            const apiError = error as ApiError | undefined;
            const responseData = data as IndexResponseData | undefined;

            if (error || responseData?.error) {
              errors.push({
                file: file.name,
                error:
                  apiError?.detail?.[0]?.msg ||
                  responseData?.error ||
                  "Unknown error"
              });
            }
          } catch (err: any) {
            console.error(`Failed to index file ${file.name}:`, err);
            errors.push({
              file: file.name,
              error: String(err?.message || err)
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
        }

        setIndexProgress(null); // Reset progress when all files are processed
        setIndexErrors(errors);
      },
    [queryClient]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent, collectionName: string) => {
      event.preventDefault();
      setDragOverCollection(collectionName);
    },
    []
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
