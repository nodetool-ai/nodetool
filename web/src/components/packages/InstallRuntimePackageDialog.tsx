import { memo, useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Caption, Dialog, FlexColumn, Text } from "../ui_primitives";
import useRuntimePackagePromptStore from "../../stores/RuntimePackagePromptStore";
import useRuntimePackagesStore from "../../stores/RuntimePackagesStore";
import { useOpenPackageManagerInNewTab } from "../../hooks/useOpenPackageManager";

/** Model lists a newly installed local runtime can add entries to. */
const MODEL_QUERY_KEYS = [
  "providers",
  "asr-models",
  "tts-models",
  "language-models",
  "embedding-models",
  "image-models",
  "rerank-models"
];

/**
 * Installs the optional package a run failed on, in place. The desktop app
 * installs it; a browser session cannot, so it links to the Package Manager.
 */
const InstallRuntimePackageDialog: React.FC = () => {
  const packageId = useRuntimePackagePromptStore((s) => s.packageId);
  const dismiss = useRuntimePackagePromptStore((s) => s.dismiss);
  const available = useRuntimePackagesStore((s) => s.available);
  const status = useRuntimePackagesStore((s) =>
    s.statuses.find((p) => p.id === packageId)
  );
  const refresh = useRuntimePackagesStore((s) => s.refresh);
  const install = useRuntimePackagesStore((s) => s.install);
  const openPackageManager = useOpenPackageManagerInNewTab();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<"ask" | "installing" | "done" | "failed">(
    "ask"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!packageId) {
      return;
    }
    setPhase("ask");
    setError(null);
    void refresh();
  }, [packageId, refresh]);

  const handleInstall = useCallback(async () => {
    if (!packageId) {
      return;
    }
    setPhase("installing");
    const ok = await install(packageId);
    if (ok) {
      for (const key of MODEL_QUERY_KEYS) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      setPhase("done");
    } else {
      setError(useRuntimePackagesStore.getState().error);
      setPhase("failed");
    }
  }, [packageId, install, queryClient]);

  if (!packageId) {
    return null;
  }

  const name = status?.name ?? packageId;
  const installed = phase === "done" || (status?.installed ?? false);

  if (!available) {
    return (
      <Dialog
        open
        onClose={dismiss}
        title={`${name} is not installed`}
        showActions
        onConfirm={() => {
          openPackageManager();
          dismiss();
        }}
        onCancel={dismiss}
        confirmText="Open Package Manager"
        cancelText="Close"
        minWidth="440px"
      >
        <Text size="small">
          The run needs {name}. Only the desktop app can install it. Install
          it in the Package Manager of the machine that runs NodeTool.
        </Text>
      </Dialog>
    );
  }

  if (installed) {
    return (
      <Dialog
        open
        onClose={dismiss}
        title={`${name} is installed`}
        showActions
        onConfirm={dismiss}
        onCancel={dismiss}
        confirmText="Done"
        cancelText="Close"
        minWidth="440px"
      >
        <Text size="small">Run the workflow again to use it.</Text>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={phase === "installing" ? undefined : dismiss}
      title={`Install ${name}?`}
      showActions
      onConfirm={handleInstall}
      onCancel={dismiss}
      confirmText={phase === "installing" ? "Installing…" : "Install"}
      cancelText="Not now"
      confirmDisabled={phase === "installing"}
      cancelDisabled={phase === "installing"}
      isLoading={phase === "installing"}
      minWidth="440px"
    >
      <FlexColumn gap={2}>
        <Text size="small">
          The run stopped because {name} is not installed. Install it now, then
          run the workflow again.
        </Text>
        {status?.description && (
          <Caption sx={{ opacity: 0.7 }}>{status.description}</Caption>
        )}
        {phase === "failed" && (
          <Caption sx={{ color: "error.main" }}>
            {error ?? "The install failed. Try again from the Package Manager."}
          </Caption>
        )}
      </FlexColumn>
    </Dialog>
  );
};

export default memo(InstallRuntimePackageDialog);
