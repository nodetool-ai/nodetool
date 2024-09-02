import { useCallback } from "react";
import { XYPosition } from "reactflow";
import Papa from "papaparse";
import { devError } from "../../utils/DevLog";

interface ParsedCSV {
  data: string[][];
  errors: Papa.ParseError[];
  meta: Papa.ParseMeta;
}

export const useFileEmbedder = (
  createNode: any,
  addNode: any,
  metadata: any
) => {
  return useCallback(
    (files: File[], position: XYPosition) => {
      if (metadata === undefined) {
        devError("metadata is undefined");
        return [];
      }
      return files.reduce((acc: File[], file: File) => {
        if (file.type === "text/csv") {
          const nodeType = "nodetool.constant.DataFrame";
          const nodeMetadata = metadata.metadataByType[nodeType];
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target) {
              const csv = event.target.result as string;
              const res = Papa.parse<string[]>(csv, {
                header: false
              }) as ParsedCSV;

              if (res.data.length > 0) {
                const columnDefs = res.data[0].map((col: string) => ({
                  name: col,
                  data_type: "string"
                }));
                const data = res.data.slice(1);
                const newNode = createNode(nodeMetadata, position);
                newNode.data.properties.value = {
                  type: "dataframe",
                  columns: columnDefs,
                  data: data
                };
                addNode(newNode);
              } else {
                devError("CSV file is empty or could not be parsed");
              }
            }
          };
          reader.readAsText(file);
        } else {
          acc.push(file);
        }
        return acc;
      }, [] as File[]);
    },
    [createNode, addNode, metadata]
  );
};
