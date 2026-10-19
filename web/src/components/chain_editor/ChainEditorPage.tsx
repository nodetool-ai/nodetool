/** @jsxImportSource @emotion/react */
/**
 * Full-page wrapper for the chain editor.
 * Handles loading an existing workflow or starting fresh.
 */

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import ErrorBanner from "../support/ErrorBanner";
import { LoadingSpinner, FlexColumn } from "../ui_primitives";
import { ChainEditor } from "./ChainEditor";
import { useChainEditorStore } from "./useChainEditorStore";
import { trpcClient } from "../../trpc/client";
import type { Workflow } from "../../stores/ApiTypes";

const ChainEditorPage: React.FC = () => {
  const { t } = useTranslation();
  const { workflowId } = useParams<{ workflowId?: string }>();
  const [loading, setLoading] = useState(!!workflowId);
  const [error, setError] = useState<string | null>(null);

  const loadWorkflow = useChainEditorStore((s) => s.loadWorkflow);
  const newWorkflow = useChainEditorStore((s) => s.newWorkflow);

  useEffect(() => {
    const init = async () => {
      try {
        if (workflowId) {
          const data = await trpcClient.workflows.get.query({ id: workflowId });
          if (!data) {
            setError(t("pass3_0.chainEditor.errors.workflowNotFound"));
            return;
          }
          loadWorkflow(data as Workflow);
        } else {
          newWorkflow();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("pass3_0.chainEditor.errors.loadFailed"));
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [workflowId, loadWorkflow, newWorkflow, t]);

  if (loading) {
    return (
      <FlexColumn align="center" justify="center" fullHeight fullWidth gap={2}>
        <LoadingSpinner size="large" text={t("pass3_0.chainEditor.loadingWorkflow")} />
      </FlexColumn>
    );
  }

  if (error) {
    return (
      <FlexColumn align="center" justify="center" fullHeight fullWidth gap={2}>
        <ErrorBanner
          report={{
            source: "operation-failure",
            summary: t("pass3_0.chainEditor.errors.loadSummary"),
            errorText: error,
            workflowId
          }}
        >
          {error}
        </ErrorBanner>
      </FlexColumn>
    );
  }

  return <ChainEditor />;
};

export default ChainEditorPage;
