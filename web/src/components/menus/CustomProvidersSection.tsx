/** @jsxImportSource @emotion/react */
import { memo, useCallback, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/AddOutlined";
import DeleteIcon from "@mui/icons-material/DeleteOutline";
import HubIcon from "@mui/icons-material/Hub";
import {
  customProviderBaseUrlError,
  customProviderSlugError,
  slugifyProviderName
} from "@nodetool-ai/protocol";
import {
  BORDER_RADIUS,
  Caption,
  Card,
  Chip,
  Dialog,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  Text,
  TextInput,
  MOTION,
  SPACING
} from "../ui_primitives";
import { ConfirmDialog } from "../ui_primitives";
import { useNotificationStore } from "../../stores/NotificationStore";
import { trpcClient, type RouterOutputs } from "../../trpc/client";

type CustomProviderRow = RouterOutputs["customProviders"]["list"][number];
type TestResult = RouterOutputs["customProviders"]["test"];

interface SaveInput {
  slug: string;
  name: string;
  base_url: string;
  /** Omitted keeps the stored key; empty string clears it. */
  api_key?: string;
  models?: string[];
  image_models?: string[];
  video_models?: string[];
}

const QUERY_KEY = ["custom-providers"];

interface DraftState {
  slug: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string;
  imageModels: string;
  videoModels: string;
}

const EMPTY_DRAFT: DraftState = {
  slug: "",
  name: "",
  baseUrl: "",
  apiKey: "",
  models: "",
  imageModels: "",
  videoModels: ""
};

const parseModels = (value: string): string[] =>
  value
    .split(/[\n,]/)
    .map((m) => m.trim())
    .filter(Boolean);

const ProviderRow = memo(function ProviderRow({
  provider,
  onEdit,
  onDelete,
  onTest,
  testing,
  testResult
}: {
  provider: CustomProviderRow;
  onEdit: (provider: CustomProviderRow) => void;
  onDelete: (provider: CustomProviderRow) => void;
  onTest: (provider: CustomProviderRow) => void;
  testing: boolean;
  testResult: TestResult | null;
}) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const handleEdit = useCallback(() => onEdit(provider), [onEdit, provider]);
  const handleDelete = useCallback(() => onDelete(provider), [onDelete, provider]);
  const handleTest = useCallback(() => onTest(provider), [onTest, provider]);
  const handListed =
    provider.models.length +
    provider.image_models.length +
    provider.video_models.length;

  return (
    <Card
      variant="outlined"
      padding="compact"
      sx={{
        display: "flex",
        flexDirection: { xs: "column", sm: "row" },
        alignItems: { xs: "stretch", sm: "center" },
        gap: theme.spacing(3),
        borderRadius: BORDER_RADIUS.lg,
        border: `1px solid ${theme.vars.palette.divider}`,
        transition: MOTION.border,
        "&:hover": { borderColor: theme.vars.palette.grey[700] }
      }}
    >
      <FlexRow align="center" gap={3} sx={{ flex: 1, minWidth: 0 }}>
        <FlexRow
          align="center"
          justify="center"
          sx={{
            width: 48,
            height: 48,
            minWidth: 48,
            borderRadius: BORDER_RADIUS.lg,
            backgroundColor: theme.vars.palette.background.default
          }}
        >
          <HubIcon sx={{ fontSize: 24, opacity: 0.7 }} />
        </FlexRow>
        <FlexColumn sx={{ flex: 1, minWidth: 0, gap: theme.spacing(0.5) }}>
          <FlexRow align="center" gap={0.5}>
            <Text size="small" weight={600}>
              {provider.name}
            </Text>
            <Chip label={provider.provider_id} compact variant="outlined" />
            {provider.has_api_key && (
              <Chip label={t("i18n-cont-settings-01.customProviders.keySet")} compact variant="outlined" color="success" />
            )}
          </FlexRow>
          <Caption sx={{ opacity: 0.55, wordBreak: "break-all" }}>
            {provider.base_url || t("i18n-cont-settings-01.customProviders.noEndpoint")}
          </Caption>
          {handListed > 0 && (
            <Caption size="smaller" sx={{ opacity: 0.45 }}>
              {t("i18n-cont-settings-01.customProviders.modelsListed", {
                count: handListed,
                formattedCount: new Intl.NumberFormat(i18n.language).format(handListed)
              })}
            </Caption>
          )}
          {testResult?.counts && testResult.ok && (
            <FlexRow align="center" gap={0.5} sx={{ flexWrap: "wrap" }}>
              <Chip
                label={t("i18n-cont-settings-01.customProviders.chatCount", { count: testResult.counts.language, formattedCount: new Intl.NumberFormat(i18n.language).format(testResult.counts.language) })}
                compact
                variant="outlined"
              />
              <Chip
                label={t("i18n-cont-settings-01.customProviders.imageCount", { count: testResult.counts.image, formattedCount: new Intl.NumberFormat(i18n.language).format(testResult.counts.image) })}
                compact
                variant="outlined"
              />
              <Chip
                label={t("i18n-cont-settings-01.customProviders.videoCount", { count: testResult.counts.video, formattedCount: new Intl.NumberFormat(i18n.language).format(testResult.counts.video) })}
                compact
                variant="outlined"
              />
            </FlexRow>
          )}
          {testResult && (
            <Caption
              size="smaller"
              color={testResult.ok ? "success" : "error"}
              sx={{ lineHeight: 1.5 }}
            >
              {testResult.message}
            </Caption>
          )}
        </FlexColumn>
      </FlexRow>

      <FlexRow align="center" gap={0.5} sx={{ flexWrap: "wrap" }}>
        <EditorButton
          density="compact"
          variant="text"
          size="small"
          onClick={handleTest}
          disabled={testing}
        >
          {testing ? t("i18n-cont-settings-01.customProviders.testing") : t("i18n-cont-settings-01.customProviders.test")}
        </EditorButton>
        <EditorButton
          density="compact"
          variant="outlined"
          size="small"
          onClick={handleEdit}
        >
          {t("i18n-cont-settings-01.common.edit")}
        </EditorButton>
        <EditorButton
          density="compact"
          variant="text"
          size="small"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={handleDelete}
        >
          {t("i18n-cont-settings-01.common.remove")}
        </EditorButton>
      </FlexRow>
    </Card>
  );
});

/**
 * Add any OpenAI-compatible endpoint as a provider — a proxy, a gateway, a
 * self-hosted router — without a code change. The card list mirrors the
 * built-in provider cards above it.
 */
export const CustomProvidersSection = memo(function CustomProvidersSection() {
  const { t } = useTranslation();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore((s) => s.addNotification);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [pendingDelete, setPendingDelete] = useState<CustomProviderRow | null>(
    null
  );
  const [testingSlug, setTestingSlug] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  const { data: providers } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => trpcClient.customProviders.list.query(),
    refetchOnWindowFocus: false
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ["providers"] });
  }, [queryClient]);

  const runTest = useCallback(async (slug: string) => {
    setTestingSlug(slug);
    let result: TestResult;
    try {
      result = await trpcClient.customProviders.test.mutate({ slug });
    } catch (err) {
      // The procedure answers a bad endpoint with a message of its own; only a
      // transport failure reaches here, and it is an answer too.
      result = { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
    setTestResults((prev) => ({ ...prev, [slug]: result }));
    setTestingSlug(null);
  }, []);

  const saveMutation = useMutation({
    mutationFn: (input: SaveInput) =>
      trpcClient.customProviders.save.mutate(input),
    onSuccess: (saved) => {
      invalidate();
      setDialogOpen(false);
      addNotification({
        type: "success",
        alert: true,
        content: t("i18n-cont-settings-01.customProviders.saved", { name: saved.name, providerId: saved.provider_id })
      });
      // Show right away which chat, image and video models the endpoint
      // serves, so a missed image or video model is visible before the user
      // goes looking for it in a node's picker.
      void runTest(saved.slug);
    },
    onError: (err: Error) => {
      addNotification({
        type: "error",
        dismissable: true,
        content: err.message
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (slug: string) =>
      trpcClient.customProviders.delete.mutate({ slug }),
    onSuccess: () => {
      invalidate();
      addNotification({
        type: "success",
        alert: true,
        content: t("i18n-cont-settings-01.customProviders.removed")
      });
    }
  });

  const handleAdd = useCallback(() => {
    setEditingSlug(null);
    setDraft(EMPTY_DRAFT);
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((provider: CustomProviderRow) => {
    setEditingSlug(provider.slug);
    setDraft({
      slug: provider.slug,
      name: provider.name,
      baseUrl: provider.base_url,
      apiKey: "",
      models: provider.models.join(", "),
      imageModels: provider.image_models.join(", "),
      videoModels: provider.video_models.join(", ")
    });
    setDialogOpen(true);
  }, []);

  const handleTest = useCallback(
    (provider: CustomProviderRow) => {
      void runTest(provider.slug);
    },
    [runTest]
  );

  const handleClose = useCallback(() => setDialogOpen(false), []);

  // The name types first and the slug follows it, but only while creating —
  // an existing slug is the provider's wire id and renaming it would orphan
  // every model reference in a saved workflow.
  const handleNameChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const name = event.target.value;
      setDraft((prev) =>
        editingSlug
          ? { ...prev, name }
          : { ...prev, name, slug: slugifyProviderName(name) }
      );
    },
    [editingSlug]
  );

  const handleSlugChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const slug = e.target.value;
    setDraft((prev) => ({ ...prev, slug }));
  }, []);

  const handleBaseUrlChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const baseUrl = e.target.value;
    setDraft((prev) => ({ ...prev, baseUrl }));
  }, []);

  const handleApiKeyChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const apiKey = e.target.value;
    setDraft((prev) => ({ ...prev, apiKey }));
  }, []);

  const handleModelsChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const models = e.target.value;
    setDraft((prev) => ({ ...prev, models }));
  }, []);

  const handleImageModelsChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const imageModels = e.target.value;
      setDraft((prev) => ({ ...prev, imageModels }));
    },
    []
  );

  const handleVideoModelsChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const videoModels = e.target.value;
      setDraft((prev) => ({ ...prev, videoModels }));
    },
    []
  );

  const slugError = customProviderSlugError(draft.slug);
  const urlError = customProviderBaseUrlError(draft.baseUrl);
  const translatedSlugError = slugError
    ? t(slugError === "A slug is required."
        ? "i18n-cont-settings-01.customProviders.slugRequired"
        : "i18n-cont-settings-01.customProviders.slugFormat")
    : undefined;
  const translatedBaseUrlError = urlError
    ? t(urlError === "A base URL is required."
        ? "i18n-cont-settings-01.customProviders.baseUrlRequired"
        : urlError.startsWith("Enter a full URL")
          ? "i18n-cont-settings-01.customProviders.baseUrlInvalid"
          : "i18n-cont-settings-01.customProviders.baseUrlProtocol")
    : undefined;
  const duplicateSlug =
    !editingSlug && (providers ?? []).some((p) => p.slug === draft.slug);

  const handleSave = useCallback(() => {
    const input: SaveInput = {
      slug: draft.slug,
      name: draft.name.trim() || draft.slug,
      base_url: draft.baseUrl,
      models: parseModels(draft.models),
      image_models: parseModels(draft.imageModels),
      video_models: parseModels(draft.videoModels)
    };
    // An untouched key field on an edit means "keep what is stored"; on a new
    // provider it means "no key", which the empty string also expresses.
    if (draft.apiKey || !editingSlug) {
      input.api_key = draft.apiKey;
    }
    saveMutation.mutate(input);
  }, [draft, editingSlug, saveMutation]);

  const confirmDelete = useCallback(() => {
    if (pendingDelete) {
      deleteMutation.mutate(pendingDelete.slug);
    }
  }, [deleteMutation, pendingDelete]);

  const handleCancelDelete = useCallback(() => setPendingDelete(null), []);

  const rows = providers ?? [];
  const envSlug = (draft.slug || "SLUG").toUpperCase();

  return (
    <div>
      <FlexRow
        align="center"
        justify="space-between"
        sx={{ marginBottom: theme.spacing(3) }}
      >
        <FlexColumn gap={0.5}>
          <Text size="normal" weight={600}>
            {t("i18n-cont-settings-01.customProviders.heading")}
          </Text>
          <Caption sx={{ opacity: 0.55 }}>
            {t("i18n-cont-settings-01.customProviders.description")}
          </Caption>
        </FlexColumn>
        <EditorButton
          density="compact"
          variant="outlined"
          size="small"
          startIcon={<AddIcon />}
          onClick={handleAdd}
        >
          {t("i18n-cont-settings-01.customProviders.addEndpoint")}
        </EditorButton>
      </FlexRow>

      {rows.length === 0 ? (
        <EmptyState
          variant="no-results"
          title={t("i18n-cont-settings-01.customProviders.emptyTitle")}
          description={t("i18n-cont-settings-01.customProviders.emptyDescription")}
        />
      ) : (
        <FlexColumn sx={{ gap: theme.spacing(2) }}>
          {rows.map((provider) => (
            <ProviderRow
              key={provider.slug}
              provider={provider}
              onEdit={handleEdit}
              onDelete={setPendingDelete}
              onTest={handleTest}
              testing={testingSlug === provider.slug}
              testResult={testResults[provider.slug] ?? null}
            />
          ))}
        </FlexColumn>
      )}

      <Dialog
        open={dialogOpen}
        onClose={handleClose}
        fullWidth
        title={editingSlug ? t("i18n-cont-settings-01.customProviders.editTitle") : t("i18n-cont-settings-01.customProviders.addTitle")}
        onConfirm={handleSave}
        confirmText={editingSlug ? t("i18n-cont-settings-01.common.save") : t("i18n-cont-settings-01.common.add")}
        confirmDisabled={
          Boolean(slugError) || Boolean(urlError) || duplicateSlug
        }
      >
        <FlexColumn gap={SPACING.lg}>
          <TextInput
            label={t("i18n-cont-settings-01.common.name")}
            value={draft.name}
            onChange={handleNameChange}
            fullWidth
            placeholder={t("i18n-cont-settings-01.common.providerNamePlaceholder")}
            autoFocus
            variant="outlined"
            size="small"
          />
          <TextInput
            label={t("i18n-cont-settings-01.customProviders.slug")}
            value={draft.slug}
            onChange={handleSlugChange}
            fullWidth
            disabled={Boolean(editingSlug)}
            placeholder="my_proxy"
            variant="outlined"
            size="small"
            errorMessage={
              duplicateSlug
                ? t("i18n-cont-settings-01.customProviders.duplicateSlug")
                : translatedSlugError
            }
            helperText={t("i18n-cont-settings-01.customProviders.providerId", { slug: draft.slug || "…" })}
          />
          <TextInput
            label={t("i18n-cont-settings-01.customProviders.baseUrl")}
            value={draft.baseUrl}
            onChange={handleBaseUrlChange}
            fullWidth
            placeholder="https://proxy.example.com/v1"
            variant="outlined"
            size="small"
            errorMessage={translatedBaseUrlError}
            helperText={t("i18n-cont-settings-01.customProviders.baseUrlHelp")}
          />
          <TextInput
            label={t("i18n-cont-settings-01.customProviders.apiKey")}
            type="password"
            value={draft.apiKey}
            onChange={handleApiKeyChange}
            fullWidth
            placeholder={
              editingSlug ? t("i18n-cont-settings-01.customProviders.keepStoredKey") : t("i18n-cont-settings-01.common.optional")
            }
            variant="outlined"
            size="small"
            helperText={t("i18n-cont-settings-01.customProviders.credentialsHelp", { baseUrlEnv: `CUSTOM_${envSlug}_BASE_URL`, apiKeyEnv: `CUSTOM_${envSlug}_API_KEY` })}
          />
          <TextInput
            label={t("i18n-cont-settings-01.customProviders.models")}
            value={draft.models}
            onChange={handleModelsChange}
            fullWidth
            placeholder={t("i18n-cont-settings-01.customProviders.modelsPlaceholder")}
            variant="outlined"
            size="small"
            helperText={t("i18n-cont-settings-01.customProviders.modelsHelp")}
          />
          <TextInput
            label={t("i18n-cont-settings-01.customProviders.imageModels")}
            value={draft.imageModels}
            onChange={handleImageModelsChange}
            fullWidth
            placeholder={t("i18n-cont-settings-01.customProviders.imageModelsPlaceholder")}
            variant="outlined"
            size="small"
            helperText={t("i18n-cont-settings-01.customProviders.imageModelsHelp")}
          />
          <TextInput
            label={t("i18n-cont-settings-01.customProviders.videoModels")}
            value={draft.videoModels}
            onChange={handleVideoModelsChange}
            fullWidth
            placeholder={t("i18n-cont-settings-01.customProviders.videoModelsPlaceholder")}
            variant="outlined"
            size="small"
            helperText={t("i18n-cont-settings-01.customProviders.videoModelsHelp")}
          />
        </FlexColumn>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={t("i18n-cont-settings-01.customProviders.removeTitle")}
        content={t("i18n-cont-settings-01.customProviders.removeConfirm", { name: pendingDelete?.name ?? "" })}
        confirmText={t("i18n-cont-settings-01.common.remove")}
        cancelText={t("i18n-cont-settings-01.common.cancel")}
        destructive
        onConfirm={confirmDelete}
        onClose={handleCancelDelete}
      />
    </div>
  );
});

export default CustomProvidersSection;
