// - create DataFrame nodes from CSV files

import { useCallback } from "react";
import { XYPosition } from "@xyflow/react";
import Papa from "papaparse";
import log from "loglevel";
import useMetadataStore from "../../stores/MetadataStore";

interface ParsedCSV {
  data: string[][];
  errors: Papa.ParseError[];
  meta: Papa.ParseMeta;
}

export const useCreateDataframe = (createNode: any, addNode: any) => {
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  return useCallback(
    (files: File[], position: XYPosition) => {
      return files.reduce((acc: File[], file: File) => {
        if (file.type === "text/csv") {
          const nodeType = "nodetool.constant.DataFrame";
          const nodeMetadata = getMetadata(nodeType);
          const reader = new FileReader();
          if (nodeMetadata === undefined) {
            throw new Error("metadata for dataframe node is missing");
          }
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
                log.error("CSV file is empty or could not be parsed");
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
    [createNode, addNode, getMetadata]
  );
};
