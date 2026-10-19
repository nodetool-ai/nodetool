import { memo, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";

import {
  AlertBanner,
  Button,
  Caption,
  Dialog,
  FlexColumn,
  SPACING,
  Text
} from "../ui_primitives";
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
 * Installs the optional package a run or a request failed on, in place. The
 * desktop app installs it; a browser session cannot, so it links to the
 * Package Manager.
 */
const InstallRuntimePackageDialog: React.FC = () => {
  const { t } = useTranslation();
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
        title={t("i18n-next31.runtimePackage.notInstalledTitle", { name })}
        onConfirm={() => {
          openPackageManager();
          dismiss();
        }}
        confirmText={t("i18n-next31.runtimePackage.openPackageManager")}
        cancelText={t("i18n-next31.runtimePackage.close")}
        maxWidth="xs"
        fullWidth
      >
        <Text size="small">
          {t("i18n-next31.runtimePackage.desktopOnlyDescription", { name })}
        </Text>
      </Dialog>
    );
  }

  if (installed) {
    return (
      <Dialog
        open
        onClose={dismiss}
        title={t("i18n-next31.runtimePackage.installedTitle", { name })}
        maxWidth="xs"
        fullWidth
        actions={
          <Button variant="contained" onClick={dismiss} autoFocus>
            {t("i18n-next31.runtimePackage.done")}
          </Button>
        }
      >
        <Text size="small">{t("i18n-next31.runtimePackage.tryAgain")}</Text>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={phase === "installing" ? undefined : dismiss}
      title={t("i18n-next31.runtimePackage.installTitle", { name })}
      onConfirm={handleInstall}
      confirmText={phase === "installing" ? t("i18n-next31.runtimePackage.installing") : t("i18n-next31.runtimePackage.install")}
      cancelText={t("i18n-next31.runtimePackage.notNow")}
      confirmDisabled={phase === "installing"}
      cancelDisabled={phase === "installing"}
      isLoading={phase === "installing"}
      maxWidth="xs"
      fullWidth
    >
      <FlexColumn gap={SPACING.md}>
        <Text size="small">
          {t("i18n-next31.runtimePackage.installPrompt", { name })}
        </Text>
        {status?.description && (
          <Caption color="secondary">{status.description}</Caption>
        )}
        {phase === "failed" && (
          <AlertBanner severity="error" compact>
            {error ?? t("i18n-next31.runtimePackage.installFailed")}
          </AlertBanner>
        )}
      </FlexColumn>
    </Dialog>
  );
};

export default memo(InstallRuntimePackageDialog);
