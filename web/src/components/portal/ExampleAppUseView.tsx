import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { Data } from "@puckeditor/core";
import { applicationBundle } from "@nodetool-ai/protocol/api-schemas/applications.js";
import {
  runJsScriptResponse,
  type JsScriptDocument
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import type { Workflow } from "../../stores/ApiTypes";
import { restFetch } from "../../lib/rest-fetch";
import {
  readScriptRunBody,
  scriptRunHeaders,
  type runJsScript
} from "../jsScript/runJsScript";
import AppRuntimeView from "../appbuilder/AppRuntimeView";
import { parseApplicationDocument } from "../appbuilder/appData";
import { EmptyState, LoadingSpinner } from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";

interface ExampleAppUseViewProps {
  slug: string;
}

export default function ExampleAppUseView({ slug }: ExampleAppUseViewProps) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ["example-app-bundle", slug],
    queryFn: async ({ signal }) => {
      const response = await restFetch(
        `/api/applications/examples/${encodeURIComponent(slug)}`,
        { signal }
      );
      if (!response.ok) {
        throw new Error(t("pass3_18.examples.app.errors.loadFailed"));
      }
      return applicationBundle.parse(await response.json());
    },
    staleTime: Infinity,
    retry: false
  });
  const scriptRunner = useCallback<typeof runJsScript>(
    async (key, inputs, inputStreams, _version, onLine, appRun) => {
      const response = await restFetch(
        `/api/applications/examples/${encodeURIComponent(slug)}/scripts/${encodeURIComponent(key)}/run`,
        {
          method: "POST",
          headers: scriptRunHeaders(onLine),
          body: JSON.stringify({ inputs, input_streams: inputStreams, ...appRun })
        }
      );
      if (!response.ok) {
        throw new Error(t("pass3_18.examples.app.errors.operationFailed"));
      }
      return runJsScriptResponse.parse(
        await readScriptRunBody(response, onLine)
      );
    },
    [slug, t]
  );
  if (query.isPending) {
    return <LoadingSpinner text={t("pass3_18.examples.app.loading")} />;
  }
  if (query.isError) {
    return (
      <EmptyState
        variant="error"
        title={t("pass3_18.examples.app.errors.loadTitle")}
        actionText={t("pass3_18.examples.actions.retry")}
        onAction={() => void query.refetch()}
        description={
          <ReportBugButton
            context={{
              source: "panel-crash",
              summary: t("pass3_18.examples.app.errors.reportSummary"),
              errorText: query.error.message
            }}
          />
        }
      />
    );
  }
  const bundle = query.data;
  const workflows: Record<string, Workflow> = {};
  for (const item of bundle.workflows) {
    workflows[item.key] = {
      id: item.key,
      name: item.name,
      description: item.description ?? "",
      // Zod infers recursive dynamic output metadata as unknown.
      // The bundle schema validates the graph before this boundary cast.
      graph: item.graph as unknown as Workflow["graph"],
      access: "private",
      created_at: "",
      updated_at: ""
    };
  }
  const scripts: Record<string, JsScriptDocument> = {};
  for (const item of bundle.scripts) {
    scripts[item.key] = item.document;
  }
  const document = parseApplicationDocument(bundle.app);
  if (!document) {
    return (
      <EmptyState
        variant="error"
        title={t("pass3_18.examples.app.errors.invalidDocument")}
      />
    );
  }
  const host =
    workflows[document.operations[0]?.workflowId ?? ""] ??
    ({
      id: `example-app:${slug}`,
      name: bundle.name,
      description: bundle.description,
      graph: { nodes: [], edges: [] },
      access: "private",
      created_at: "",
      updated_at: ""
    } satisfies Workflow);
  return (
    <AppRuntimeView
      workflow={{ ...host, id: `example-app:${slug}` }}
      data={document.ui as Data}
      document={document}
      workflowOverrides={workflows}
      scriptOverrides={scripts}
      scriptRunner={scriptRunner}
    />
  );
}
