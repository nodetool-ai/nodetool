import { useQuery } from "@tanstack/react-query";
import ErrorBanner from "../support/ErrorBanner";
import { LoadingSpinner } from "../ui_primitives";
import { CsvTableView } from "./CsvTableView";

interface DocumentTablePreviewProps {
  url: string;
  format: "csv" | "tsv";
}

const DocumentTablePreview = ({ url, format }: DocumentTablePreviewProps) => {
  const { data, error, refetch } = useQuery({
    queryKey: ["document-table", url],
    staleTime: 60_000,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await fetch(url, { signal });
      if (!response.ok) {
        throw new Error(`Document request failed: ${response.status}`);
      }
      return response.text();
    }
  });

  if (error) {
    return (
      <ErrorBanner
        report={{
          source: "operation-failure",
          summary: "Document table preview failed to load",
          errorText: error.message
        }}
        onRetry={() => void refetch()}
      >
        Could not load the table. Try again.
      </ErrorBanner>
    );
  }

  if (data === undefined) {
    return <LoadingSpinner text="Loading table" />;
  }

  return <CsvTableView text={data} name={`document.${format}`} />;
};

export default DocumentTablePreview;
