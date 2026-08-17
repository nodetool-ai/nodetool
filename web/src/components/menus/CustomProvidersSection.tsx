/** @jsxImportSource @emotion/react */
import { memo, useCallback, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
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
  MOTION
} from "../ui_primitives";
import ConfirmDialog from "../dialogs/ConfirmDialog";
import { useNotificationStore } from "../../stores/NotificationStore";
import { trpcClient, type RouterOutputs } from "../../trpc/client";

type CustomProviderRow = RouterOutputs["customProviders"]["list"][number];

interface TestResult {
  ok: boolean;
  message: string;
}

interface SaveInput {
  slug: string;
  name: string;
  base_url: string;
  /** Omitted keeps the stored key; empty string clears it. */
  api_key?: string;
  models?: string[];
}

const QUERY_KEY = ["custom-providers"];

interface DraftState {
  slug: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string;
}

const EMPTY_DRAFT: DraftState = {
  slug: "",
  name: "",
  baseUrl: "",
  apiKey: "",
  models: ""
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
  const theme = useTheme();
  const handleEdit = useCallback(() => onEdit(provider), [onEdit, provider]);
  const handleDelete = useCallback(() => onDelete(provider), [onDelete, provider]);
  const handleTest = useCallback(() => onTest(provider), [onTest, provider]);

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
              <Chip label="Key set" compact variant="outlined" color="success" />
            )}
          </FlexRow>
          <Caption sx={{ opacity: 0.55, wordBreak: "break-all" }}>
            {provider.base_url || "No endpoint set"}
          </Caption>
          {provider.models.length > 0 && (
            <Caption size="smaller" sx={{ opacity: 0.45 }}>
              {provider.models.length} model
              {provider.models.length === 1 ? "" : "s"} listed by hand
            </Caption>
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
          {testing ? "Testing…" : "Test"}
        </EditorButton>
        <EditorButton
          density="compact"
          variant="outlined"
          size="small"
          onClick={handleEdit}
        >
          Edit
        </EditorButton>
        <EditorButton
          density="compact"
          variant="text"
          size="small"
          color="error"
          startIcon={<DeleteIcon sx={{ fontSize: 14 }} />}
          onClick={handleDelete}
        >
          Remove
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

  const saveMutation = useMutation({
    mutationFn: (input: SaveInput) =>
      trpcClient.customProviders.save.mutate(input),
    onSuccess: (saved) => {
      invalidate();
      setDialogOpen(false);
      addNotification({
        type: "success",
        alert: true,
        content: `${saved.name} saved as ${saved.provider_id}`
      });
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
        content: "Provider removed"
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
      models: provider.models.join(", ")
    });
    setDialogOpen(true);
  }, []);

  const handleTest = useCallback(async (provider: CustomProviderRow) => {
    setTestingSlug(provider.slug);
    let result: TestResult;
    try {
      result = await trpcClient.customProviders.test.mutate({
        slug: provider.slug
      });
    } catch (err) {
      // The procedure answers a bad endpoint with a message of its own; only a
      // transport failure reaches here, and it is an answer too.
      result = { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
    setTestResults((prev) => ({ ...prev, [provider.slug]: result }));
    setTestingSlug(null);
  }, []);

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

  const slugError = customProviderSlugError(draft.slug);
  const urlError = customProviderBaseUrlError(draft.baseUrl);
  const duplicateSlug =
    !editingSlug && (providers ?? []).some((p) => p.slug === draft.slug);

  const handleSave = useCallback(() => {
    const input: SaveInput = {
      slug: draft.slug,
      name: draft.name.trim() || draft.slug,
      base_url: draft.baseUrl,
      models: parseModels(draft.models)
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

  return (
    <div>
      <FlexRow
        align="center"
        justify="space-between"
        sx={{ marginBottom: theme.spacing(3) }}
      >
        <FlexColumn gap={0.5}>
          <Text size="normal" weight={600}>
            OpenAI-compatible endpoints
          </Text>
          <Caption sx={{ opacity: 0.55 }}>
            Point NodeTool at any proxy or gateway that speaks the OpenAI Chat
            Completions API.
          </Caption>
        </FlexColumn>
        <EditorButton
          density="compact"
          variant="outlined"
          size="small"
          startIcon={<AddIcon sx={{ fontSize: 16 }} />}
          onClick={handleAdd}
        >
          Add endpoint
        </EditorButton>
      </FlexRow>

      {rows.length === 0 ? (
        <EmptyState
          variant="no-results"
          title="No endpoints yet"
          description="Add a base URL and an API key to use any OpenAI-compatible provider."
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
        title={
          <Text size="normal" weight={600}>
            {editingSlug ? "Edit endpoint" : "Add OpenAI-compatible endpoint"}
          </Text>
        }
        onConfirm={handleSave}
        onCancel={handleClose}
        confirmText={editingSlug ? "Save" : "Add"}
        cancelText="Cancel"
        confirmDisabled={
          Boolean(slugError) || Boolean(urlError) || duplicateSlug
        }
      >
        <FlexColumn
          sx={{ marginTop: theme.spacing(4), gap: theme.spacing(3) }}
        >
          <TextInput
            label="Name"
            value={draft.name}
            onChange={handleNameChange}
            fullWidth
            placeholder="My Proxy"
            autoFocus
            variant="outlined"
            size="small"
          />
          <TextInput
            label="Slug"
            value={draft.slug}
            onChange={handleSlugChange}
            fullWidth
            disabled={Boolean(editingSlug)}
            placeholder="my_proxy"
            variant="outlined"
            size="small"
            errorMessage={
              duplicateSlug
                ? "That slug is already in use."
                : (slugError ?? undefined)
            }
            helperText={`Provider id: custom_${draft.slug || "…"}`}
          />
          <TextInput
            label="Base URL"
            value={draft.baseUrl}
            onChange={handleBaseUrlChange}
            fullWidth
            placeholder="https://proxy.example.com/v1"
            variant="outlined"
            size="small"
            errorMessage={urlError ?? undefined}
            helperText="Include the version path the endpoint serves, usually /v1."
          />
          <TextInput
            label="API key"
            type="password"
            value={draft.apiKey}
            onChange={handleApiKeyChange}
            fullWidth
            placeholder={
              editingSlug ? "Leave blank to keep the stored key" : "Optional"
            }
            variant="outlined"
            size="small"
          />
          <TextInput
            label="Models"
            value={draft.models}
            onChange={handleModelsChange}
            fullWidth
            placeholder="Leave blank to read GET /models"
            variant="outlined"
            size="small"
            helperText="Comma-separated model ids, for endpoints with no /models route."
          />
          <Caption sx={{ opacity: 0.6 }}>
            The URL and key are encrypted and stored per account. The same
            values can come from the environment instead, as CUSTOM_
            {(draft.slug || "SLUG").toUpperCase()}_BASE_URL and CUSTOM_
            {(draft.slug || "SLUG").toUpperCase()}_API_KEY.
          </Caption>
        </FlexColumn>
      </Dialog>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove endpoint"
        content={`Remove ${pendingDelete?.name ?? ""}? Workflows that reference its models stop resolving.`}
        confirmText="Remove"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onClose={handleCancelDelete}
      />
    </div>
  );
});

export default CustomProvidersSection;
