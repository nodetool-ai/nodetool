import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useAppInstances,
  useAppInstanceMutations
} from "../../serverState/useAppInstances";
import {
  appInstanceId,
  disposeAppRuntimeStore
} from "./runtime/appRuntimeStore";
import { loadAppInstance } from "./runtime/appInstanceApi";
import { useAppRuntimeContext } from "./runtime/AppRuntimeContext";
import { getAppSessionToken } from "../../lib/appSession";
import {
  creationProjectId,
  tabId,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import {
  AlertBanner,
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  SelectField,
  SPACING,
  Text,
  TextInput
} from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";

interface AppInstanceManagerProps {
  applicationId: string;
  latestVersion?: number;
  onAdvanced: () => void;
}

export default function AppInstanceManager({
  applicationId,
  latestVersion,
  onAdvanced
}: AppInstanceManagerProps): React.ReactElement | null {
  const { t } = useTranslation();
  const { instance, flushInstance, refreshInstance } = useAppRuntimeContext();
  const visitor = getAppSessionToken() !== null;
  const scope = {
    application_id: applicationId,
    source_id: `application:${applicationId}`,
    limit: 20
  };
  const list = useAppInstances(scope, !visitor);
  const mutations = useAppInstanceMutations(scope);
  const openTab = useWorkspaceTabsStore((state) => state.openForegroundTab);
  const closeTab = useWorkspaceTabsStore((state) => state.closeTab);
  const setTitle = useWorkspaceTabsStore((state) => state.setTitle);
  const [action, setAction] = useState<
    "new" | "rename" | "duplicate" | "delete" | "advance" | null
  >(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  if (visitor || !instance) {
    return null;
  }
  const choices = list.data?.pages[pageIndex]?.instances ?? [];
  const older = async (): Promise<void> => {
    if (!list.data?.pages[pageIndex + 1]) {
      await list.fetchNextPage();
    }
    setPageIndex((index) => index + 1);
  };
  const navigate = (id: string, title: string) =>
    openTab({
      type: "application",
      ref: applicationId,
      instanceId: id,
      title,
      mode: "view",
      projectId: creationProjectId()
    });
  const select = async (id: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await flushInstance?.();
      const selected = choices.find((item) => item.id === id);
      navigate(
        id,
        selected?.name ?? t("i18n-cont-appbuilder-10.instances.appInstance")
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t("i18n-cont-appbuilder-10.instances.switchError")
      );
    } finally {
      setBusy(false);
    }
  };
  const confirm = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await flushInstance?.();
      const current = await loadAppInstance(instance.id);
      if (action === "new") {
        const created = await mutations.create.mutateAsync({
          application_id: applicationId,
          source_id: scope.source_id,
          name: name.trim(),
          version: latestVersion ?? null,
          snapshot: current.snapshot
        });
        navigate(created.id, created.name);
      } else if (action === "duplicate") {
        const copied = await mutations.duplicate.mutateAsync({
          id: current.id,
          name: name.trim()
        });
        navigate(copied.id, copied.name);
      } else if (action === "rename") {
        const renamed = await mutations.rename.mutateAsync({
          id: current.id,
          expected_revision: current.revision,
          name: name.trim()
        });
        setTitle(applicationId, "application", renamed.name, current.id);
        await refreshInstance?.();
      } else if (action === "advance" && latestVersion !== undefined) {
        await mutations.advance.mutateAsync({
          id: current.id,
          expected_revision: current.revision,
          version: latestVersion
        });
        disposeAppRuntimeStore(
          appInstanceId(`${current.user_id}:${current.id}`)
        );
        onAdvanced();
      } else if (action === "delete") {
        await mutations.remove.mutateAsync(current.id);
        closeTab(tabId("application", applicationId, current.id));
      }
      setAction(null);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t("i18n-cont-appbuilder-10.instances.actionError")
      );
    } finally {
      setBusy(false);
    }
  };
  const show = (next: NonNullable<typeof action>): void => {
    setName(
      next === "rename"
        ? instance.name
        : next === "duplicate"
          ? t("i18n-cont-appbuilder-10.instances.copyName", {
              name: instance.name
            })
          : t("i18n-cont-appbuilder-10.instances.newInstance")
    );
    setAction(next);
    setError(null);
  };
  const named =
    action === "new" || action === "rename" || action === "duplicate";
  // While the dialog is open its own banner shows the action error.
  const outerError = (action === null ? error : null) ?? list.error?.message;
  return (
    <FlexColumn gap={SPACING.sm} padding={SPACING.lg}>
      <FlexRow gap={SPACING.sm} align="center" sx={{ flexWrap: "wrap" }}>
        <SelectField
          label={t("i18n-cont-appbuilder-10.instances.appInstance")}
          value={instance.id}
          disabled={busy}
          options={[
            ...choices,
            ...(choices.some((item) => item.id === instance.id)
              ? []
              : [instance])
          ].map((item) => ({ value: item.id, label: item.name }))}
          onChange={(id) => void select(id)}
        />
        <Caption>
          {instance.version === null
            ? t("i18n-cont-appbuilder-10.instances.draftWorkingCopy")
            : t("i18n-cont-appbuilder-10.instances.pinnedVersion", {
                version: instance.version
              })}
        </Caption>
        <EditorButton
          variant="outlined"
          color="inherit"
          disabled={busy}
          onClick={() => show("new")}
        >
          {t("i18n-cont-appbuilder-10.instances.newInstance")}
        </EditorButton>
        <EditorButton
          variant="outlined"
          color="inherit"
          disabled={busy}
          onClick={() => show("rename")}
        >
          {t("i18n-cont-appbuilder-10.instances.rename")}
        </EditorButton>
        <EditorButton
          variant="outlined"
          color="inherit"
          disabled={busy}
          onClick={() => show("duplicate")}
        >
          {t("i18n-cont-appbuilder-10.instances.duplicate")}
        </EditorButton>
        <EditorButton
          variant="outlined"
          color="inherit"
          disabled={busy}
          onClick={() => show("delete")}
        >
          {t("i18n-cont-appbuilder-10.instances.deleteInstance")}
        </EditorButton>
        {latestVersion !== undefined &&
        latestVersion > (instance.version ?? 0) ? (
          <EditorButton
            variant="outlined"
            color="inherit"
            disabled={busy}
            onClick={() => show("advance")}
          >
            {t("i18n-cont-appbuilder-10.instances.advanceToVersion", {
              version: latestVersion
            })}
          </EditorButton>
        ) : null}
        {pageIndex > 0 ? (
          <EditorButton
            variant="outlined"
            color="inherit"
            onClick={() => setPageIndex((index) => index - 1)}
          >
            {t("i18n-cont-appbuilder-10.instances.newerInstances")}
          </EditorButton>
        ) : null}
        {list.hasNextPage || list.data?.pages[pageIndex + 1] ? (
          <EditorButton
            variant="outlined"
            color="inherit"
            disabled={list.isFetchingNextPage}
            onClick={() => void older()}
          >
            {t("i18n-cont-appbuilder-10.instances.olderInstances")}
          </EditorButton>
        ) : null}
      </FlexRow>
      {outerError ? (
        <AlertBanner
          severity="error"
          action={
            <ReportBugButton
              context={{
                source: "operation-failure",
                summary: t(
                  "i18n-cont-appbuilder-10.instances.managementFailed"
                ),
                errorText: outerError
              }}
            />
          }
        >
          {outerError}
        </AlertBanner>
      ) : null}
      <Dialog
        open={action !== null}
        onClose={() => {
          if (!busy) {
            setAction(null);
          }
        }}
        title={
          action === "advance"
            ? t("i18n-cont-appbuilder-10.instances.advanceVersion")
            : action === "delete"
              ? t("i18n-cont-appbuilder-10.instances.confirmDeleteTitle")
              : action === "duplicate"
                ? t("i18n-cont-appbuilder-10.instances.duplicateInstance")
                : action === "rename"
                  ? t("i18n-cont-appbuilder-10.instances.renameInstance")
                  : t("i18n-cont-appbuilder-10.instances.newInstance")
        }
        onConfirm={() => void confirm()}
        confirmText={
          action === "delete"
            ? t("i18n-cont-appbuilder-10.instances.delete")
            : action === "new"
              ? t("i18n-cont-appbuilder-10.instances.create")
              : action === "duplicate"
                ? t("i18n-cont-appbuilder-10.instances.duplicate")
                : action === "advance"
                  ? t("i18n-cont-appbuilder-10.instances.advance")
                  : t("i18n-cont-appbuilder-10.instances.save")
        }
        isLoading={busy}
        confirmDisabled={named && !name.trim()}
        destructive={action === "delete"}
      >
        {named ? (
          <TextInput
            label={t("i18n-cont-appbuilder-10.instances.instanceName")}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        ) : (
          <Text>
            {action === "delete"
              ? t("i18n-cont-appbuilder-10.instances.deleteDescription")
              : t("i18n-cont-appbuilder-10.instances.advanceDescription")}
          </Text>
        )}
        {error ? <AlertBanner severity="error">{error}</AlertBanner> : null}
      </Dialog>
    </FlexColumn>
  );
}
