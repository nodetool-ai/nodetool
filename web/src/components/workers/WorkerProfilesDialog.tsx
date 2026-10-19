import React, { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  FlexColumn,
  FlexRow,
  Card,
  Text,
  Caption,
  Chip,
  Dialog,
  EditorButton,
  FormSection,
  SectionHeader,
  SPACING,
  NumberField,
  TextInput,
  SelectField,
  CollapsibleSection,
  AlertBanner,
  InspectorSectionTitle,
  EmptyState
} from "../ui_primitives";
import type {
  CreateWorkerProfileInput,
  WorkerSpec,
  WorkerProfile,
  WorkerTarget,
  TokenPolicy
} from "../../hooks/useWorkers";

// The secrets each provider's API needs before a worker can be provisioned.
// Verda authenticates with an OAuth2 client id AND secret, so this is a list.
const API_KEYS_BY_TARGET = {
  runpod: ["RUNPOD_API_KEY"],
  vast: ["VAST_API_KEY"],
  verda: ["VERDA_CLIENT_ID", "VERDA_CLIENT_SECRET"]
} satisfies Record<WorkerTarget, readonly string[]>;

// A profile is a reusable template (target, image, GPU spec, token policy,
// lifecycle limits); provisioning rents a GPU box from it.

// The default NodeTool worker image. Editable — only override if you publish
// your own build of `python -m nodetool.worker`.
const DEFAULT_WORKER_IMAGE = "ghcr.io/nodetool-ai/nodetool-worker:latest";
// Combined worker + ComfyUI image. A worker from this image fronts a
// loopback-only ComfyUI and reports `worker.status.comfy.enabled: true`, so it
// can run the "Run ComfyUI Workflow (Worker)" node.
const COMFY_WORKER_IMAGE = "ghcr.io/nodetool-ai/nodetool-worker-comfy:latest";
// Sentinel select value that keeps the free-text image field for a custom build.
const CUSTOM_IMAGE = "__custom_image__";
const IMAGE_PRESETS = [
  { value: DEFAULT_WORKER_IMAGE, labelKey: "imagePreset.worker" },
  { value: COMFY_WORKER_IMAGE, labelKey: "imagePreset.comfy" },
  { value: CUSTOM_IMAGE, labelKey: "imagePreset.custom" }
] as const;
const DEFAULT_IDLE_TIMEOUT = "30";
// Persistent volume default — big enough for several HF image models. Models
// download here and survive a stop/resume.
const DEFAULT_DISK_GB = "100";

// Sentinel select value that reveals a free-text GPU id field for ids not in
// the curated list below.
const CUSTOM_GPU = "__custom__";

const TARGET_OPTIONS = [
  { value: "runpod", label: "RunPod" },
  { value: "vast", label: "Vast" },
  { value: "verda", label: "Verda" }
] as const;

// GPU ids are PROVIDER-NATIVE and differ per target: RunPod wants the full
// `gpuTypeId` ("NVIDIA A40"), Vast wants its short `gpu_name` ("A40"). The
// dropdowns map a friendly "name · VRAM" label to the exact id each API needs,
// so the user never has to know the raw string. Ordered by VRAM.
// RunPod can also provision a CPU-only pod (no GPU). An empty id means "no
// GPU" — the provider maps that to `computeType: "CPU"`. Vast's empty id, by
// contrast, means "any GPU", so this option is RunPod-only.
const CPU_MACHINE = "";

const RUNPOD_GPU_OPTIONS = [
  { value: CPU_MACHINE, labelKey: "gpu.cpuOnly" },
  { value: "NVIDIA RTX A5000", label: "RTX A5000 · 24 GB" },
  { value: "NVIDIA GeForce RTX 4090", label: "RTX 4090 · 24 GB" },
  { value: "NVIDIA L4", label: "L4 · 24 GB" },
  { value: "NVIDIA RTX A6000", label: "RTX A6000 · 48 GB" },
  { value: "NVIDIA A40", label: "A40 · 48 GB" },
  { value: "NVIDIA L40S", label: "L40S · 48 GB" },
  { value: "NVIDIA A100 80GB PCIe", label: "A100 · 80 GB" },
  { value: "NVIDIA H100 80GB HBM3", label: "H100 · 80 GB" },
  { value: CUSTOM_GPU, labelKey: "gpu.other" }
] as const;

// Vast searches the marketplace, so "Any" (empty id) is valid and picks the
// cheapest offer. RunPod provisions a specific pod type, so a GPU is required.
const VAST_GPU_OPTIONS = [
  { value: "", labelKey: "gpu.anyCheapest" },
  { value: "RTX_3090", label: "RTX 3090 · 24 GB" },
  { value: "RTX_4090", label: "RTX 4090 · 24 GB" },
  { value: "RTX_A6000", label: "RTX A6000 · 48 GB" },
  { value: "A40", label: "A40 · 48 GB" },
  { value: "L40S", label: "L40S · 48 GB" },
  { value: "A100_PCIE", label: "A100 · 80 GB" },
  { value: "A100_SXM4", label: "A100 SXM4 · 80 GB" },
  { value: "H100_PCIE", label: "H100 · 80 GB" },
  { value: CUSTOM_GPU, labelKey: "gpu.other" }
] as const;

// Verda rents whole machines, so its selector is an INSTANCE TYPE
// ("1H100.80S.30V" = 1x H100 80GB, 30 vCPU), not a GPU name. The catalog is
// account- and region-specific, so it is entered rather than picked from a
// list that could go stale: `GET /v1/instance-types` lists the live ids.
const VERDA_INSTANCE_TYPE_OPTIONS = [
  { value: CUSTOM_GPU, labelKey: "gpu.enterInstanceType" }
] as const;

// Default GPU per target: a solid mid-range card for RunPod, "Any cheapest"
// for Vast, and a typed instance type for Verda.
const DEFAULT_GPU = {
  runpod: "NVIDIA A40",
  vast: "",
  verda: CUSTOM_GPU
} satisfies Record<WorkerTarget, string>;

// vCPU choices for a CPU-only RunPod pod. The provider passes this as the pod's
// vCPU count; RunPod selects a matching CPU flavor.
const VCPU_OPTIONS = [
  { value: "2", label: "2 vCPU" },
  { value: "4", label: "4 vCPU" },
  { value: "8", label: "8 vCPU" },
  { value: "16", label: "16 vCPU" },
  { value: "32", label: "32 vCPU" }
] as const;
const DEFAULT_VCPU = "4";

const TOKEN_POLICY_OPTIONS = [
  { value: "generate", labelKey: "tokenPolicy.generate" },
  { value: "fixed", labelKey: "tokenPolicy.fixed" }
] as const;

interface WorkerProfilesDialogProps {
  open: boolean;
  onClose: () => void;
  profiles: WorkerProfile[];
  createProfile: (input: CreateWorkerProfileInput) => Promise<WorkerProfile>;
  deleteProfile: (name: string) => Promise<void>;
  /**
   * Whether each provider's API key is available (store OR env), from the
   * server. `undefined` while loading — we only warn on an explicit `false`.
   */
  apiKeyStatus?: Record<WorkerTarget, boolean>;
}

function parseMinutes(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

const WorkerProfilesDialog: React.FC<WorkerProfilesDialogProps> = ({
  open,
  onClose,
  profiles,
  createProfile,
  deleteProfile,
  apiKeyStatus
}) => {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [target, setTarget] = useState<WorkerTarget>("runpod");
  const [image, setImage] = useState(DEFAULT_WORKER_IMAGE);
  // `gpu` holds the select value (a provider id, "" for Any, or CUSTOM_GPU);
  // `customGpu` holds the free-text id when CUSTOM_GPU is picked.
  const [gpu, setGpu] = useState(DEFAULT_GPU.runpod);
  const [customGpu, setCustomGpu] = useState("");
  const [vcpu, setVcpu] = useState(DEFAULT_VCPU);
  const [disk, setDisk] = useState(DEFAULT_DISK_GB);
  const [tokenPolicy, setTokenPolicy] = useState<TokenPolicy>("generate");
  const [idleTimeout, setIdleTimeout] = useState(DEFAULT_IDLE_TIMEOUT);
  const [maxLifetime, setMaxLifetime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Warn (don't block: a profile is just a template) when the selected
  // provider's API key isn't available yet — provisioning would fail without it.
  // `apiKeyStatus` reflects store OR env (the same resolution provisioning uses),
  // so an env-provided key does NOT false-warn. Only warn on an explicit false.
  const apiKeyName = API_KEYS_BY_TARGET[target].join(
    t("screens4_8.workers.profiles.keySeparator")
  );
  const apiKeyMissing = apiKeyStatus?.[target] === false;

  const gpuOptions =
    target === "runpod"
      ? RUNPOD_GPU_OPTIONS
      : target === "verda"
        ? VERDA_INSTANCE_TYPE_OPTIONS
        : VAST_GPU_OPTIONS;
  // The provider-native GPU id we'll actually submit ("" means "any/none").
  const resolvedGpu = gpu === CUSTOM_GPU ? customGpu.trim() : gpu;
  // RunPod CPU-only pod: the curated "CPU only" entry (empty id) on RunPod.
  // (Vast's empty id means "any GPU", so it is not a CPU machine.)
  const isCpuMachine = target === "runpod" && gpu === CPU_MACHINE;
  // Valid unless the user picked "Other" but left the id blank. RunPod "CPU
  // only" and Vast "Any" (both empty) are valid selections.
  const gpuOk = gpu !== CUSTOM_GPU || resolvedGpu.length > 0;

  const canCreate =
    name.trim().length > 0 && image.trim().length > 0 && gpuOk && !busy;

  // GPU ids are provider-specific, so switching target invalidates the current
  // pick — reset it to that target's default.
  const handleTargetChange = useCallback((value: WorkerTarget) => {
    setTarget(value);
    setGpu(DEFAULT_GPU[value]);
    setCustomGpu("");
  }, []);

  const resetForm = useCallback(() => {
    setName("");
    setTarget("runpod");
    setImage(DEFAULT_WORKER_IMAGE);
    setGpu(DEFAULT_GPU.runpod);
    setCustomGpu("");
    setVcpu(DEFAULT_VCPU);
    setDisk(DEFAULT_DISK_GB);
    setTokenPolicy("generate");
    setIdleTimeout(DEFAULT_IDLE_TIMEOUT);
    setMaxLifetime("");
  }, []);

  const handleCreate = useCallback(async () => {
    if (!canCreate) return;
    const input: CreateWorkerProfileInput = {
      name: name.trim(),
      target,
      image: image.trim(),
      token_policy: tokenPolicy
    };
    const spec: WorkerSpec = {};
    if (resolvedGpu) {
      spec.gpu = resolvedGpu;
    }
    if (isCpuMachine) {
      // CPU-only pod: no GPU id, carry the vCPU count instead.
      const vcpuCount = parseMinutes(vcpu);
      if (vcpuCount !== undefined) {
        spec.vcpu = vcpuCount;
      }
    }
    const diskGb = parseMinutes(disk); // reused positive-integer parse
    if (diskGb !== undefined) {
      spec.disk = diskGb;
    }
    if (Object.keys(spec).length > 0) {
      input.spec = spec;
    }
    const idle = parseMinutes(idleTimeout);
    if (idle !== undefined) {
      input.idle_timeout_minutes = idle;
    }
    const lifetime = parseMinutes(maxLifetime);
    if (lifetime !== undefined) {
      input.max_lifetime_minutes = lifetime;
    }

    setBusy(true);
    setError(null);
    try {
      await createProfile(input);
      resetForm();
    } catch (err) {
      setError(t("screens4_8.workers.profiles.createError", {
        message: err instanceof Error ? err.message : String(err)
      }));
    } finally {
      setBusy(false);
    }
  }, [
    canCreate,
    name,
    target,
    image,
    resolvedGpu,
    isCpuMachine,
    vcpu,
    disk,
    tokenPolicy,
    idleTimeout,
    maxLifetime,
    createProfile,
    resetForm,
    t
  ]);

  const handleDelete = useCallback(
    async (profileName: string) => {
      setBusy(true);
      setError(null);
      try {
        await deleteProfile(profileName);
      } catch (err) {
        setError(t("screens4_8.workers.profiles.deleteError", {
          message: err instanceof Error ? err.message : String(err)
        }));
      } finally {
        setBusy(false);
      }
    },
    [deleteProfile, t]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("screens4_8.workers.profiles.title")}
      maxWidth="sm"
      fullWidth
      actions={
        <>
          <Button variant="text" color="inherit" onClick={onClose}>
            {t("screens4_8.workers.common.close")}
          </Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!canCreate}
          >
            {t("screens4_8.workers.profiles.create")}
          </Button>
        </>
      }
    >
      <FlexColumn gap={SPACING.lg}>
        {error && (
          <AlertBanner
            severity="error"
            compact
            onClose={() => setError(null)}
          >
            {error}
          </AlertBanner>
        )}

        <FlexColumn gap={SPACING.xs}>
          <SectionHeader size="small" title={t("screens4_8.workers.profiles.existingHeading")} />
          {profiles.length === 0 ? (
            <EmptyState
              size="small"
              title={t("screens4_8.workers.profiles.emptyTitle")}
              description={t("screens4_8.workers.profiles.emptyDescription")}
            />
          ) : (
            profiles.map((profile) => (
              <Card key={profile.id} variant="outlined" padding="compact">
                <FlexRow align="center" justify="space-between" gap={SPACING.md}>
                  <FlexColumn gap={SPACING.micro}>
                    <FlexRow gap={SPACING.sm} align="center">
                      <Text size="normal" weight={600}>
                        {profile.name}
                      </Text>
                      <Chip label={profile.target} compact color="info" />
                    </FlexRow>
                    <Caption size="small">{profile.image}</Caption>
                  </FlexColumn>
                  <EditorButton
                    density="compact"
                    variant="text"
                    disabled={busy}
                    aria-label={t("screens4_8.workers.profiles.deleteAria", { name: profile.name })}
                    onClick={() => handleDelete(profile.name)}
                  >
                    {t("screens4_8.workers.common.delete")}
                  </EditorButton>
                </FlexRow>
              </Card>
            ))
          )}
        </FlexColumn>

        <FormSection label={t("screens4_8.workers.profiles.createSection")}>
          <Caption size="small">
            {t("screens4_8.workers.profiles.intro")}
          </Caption>

          <TextInput
            label={t("screens4_8.workers.profiles.nameLabel")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            helperText={t("screens4_8.workers.profiles.nameHelp")}
            fullWidth
            compact
          />

          <SelectField
            label={t("screens4_8.workers.profiles.providerLabel")}
            value={target}
            onChange={(value) => handleTargetChange(value as WorkerTarget)}
            options={TARGET_OPTIONS}
            variant="outlined"
            size="small"
            description={t("screens4_8.workers.profiles.providerHelp")}
          />

          {apiKeyMissing && (
            <AlertBanner
              severity="warning"
              compact
              title={t("screens4_8.workers.profiles.missingApiKeyTitle", { key: apiKeyName })}
            >
              {t("screens4_8.workers.profiles.missingApiKeyDescription", {
                provider: target === "runpod" ? "RunPod" : target === "vast" ? "Vast.ai" : "Verda"
              })}
            </AlertBanner>
          )}

          <SelectField
            label={t("screens4_8.workers.profiles.gpuLabel")}
            value={gpu}
            onChange={setGpu}
            options={gpuOptions.map((option) => {
              if ("labelKey" in option) {
                return { value: option.value, label: t(`screens4_8.workers.profiles.${option.labelKey}`) };
              }
              return option;
            })}
            variant="outlined"
            size="small"
            description={
              target === "runpod"
                ? t("screens4_8.workers.profiles.runpodGpuHelp")
                : t("screens4_8.workers.profiles.gpuHelp")
            }
          />
          {gpu === CUSTOM_GPU && (
            <TextInput
              label={
                target === "runpod"
                  ? t("screens4_8.workers.profiles.runpodGpuIdLabel")
                  : t("screens4_8.workers.profiles.vastGpuIdLabel")
              }
              value={customGpu}
              onChange={(e) => setCustomGpu(e.target.value)}
              helperText={
                target === "runpod"
                  ? t("screens4_8.workers.profiles.runpodGpuIdHelp")
                  : t("screens4_8.workers.profiles.vastGpuIdHelp")
              }
              fullWidth
              compact
            />
          )}
          {isCpuMachine && (
            <SelectField
              label={t("screens4_8.workers.profiles.vcpuLabel")}
              value={vcpu}
              onChange={setVcpu}
              options={VCPU_OPTIONS.map((option) => ({
                value: option.value,
                label: t("screens4_8.workers.profiles.vcpuOption", { value: Number(option.value) })
              }))}
              variant="outlined"
              size="small"
              description={t("screens4_8.workers.profiles.vcpuHelp")}
            />
          )}

          <NumberField
            label={t("screens4_8.workers.profiles.diskLabel")}
            value={disk}
            onChange={(e) => setDisk(e.target.value)}
            helperText={t("screens4_8.workers.profiles.diskHelp")}
            fullWidth
            compact
          />

          <NumberField
            label={t("screens4_8.workers.profiles.idleTimeoutLabel")}
            value={idleTimeout}
            onChange={(e) => setIdleTimeout(e.target.value)}
            helperText={t("screens4_8.workers.profiles.idleTimeoutHelp")}
            fullWidth
            compact
          />

          <CollapsibleSection
            title={<InspectorSectionTitle title={t("screens4_8.workers.profiles.advanced")} />}
            defaultOpen={false}
          >
            <FlexColumn gap={SPACING.lg} sx={{ pt: SPACING.xs }}>
              <SelectField
                label={t("screens4_8.workers.profiles.imagePresetLabel")}
                value={
                  IMAGE_PRESETS.some((p) => p.value === image)
                    ? image
                    : CUSTOM_IMAGE
                }
                onChange={(value) => {
                  if (value !== CUSTOM_IMAGE) setImage(value);
                }}
                options={IMAGE_PRESETS.map((preset) => ({ value: preset.value, label: t(`screens4_8.workers.profiles.${preset.labelKey}`) }))}
                variant="outlined"
                size="small"
                description={t("screens4_8.workers.profiles.comfyImageHelp")}
              />
              <TextInput
                label={t("screens4_8.workers.profiles.workerImageLabel")}
                value={image}
                onChange={(e) => setImage(e.target.value)}
                helperText={t("screens4_8.workers.profiles.workerImageHelp")}
                fullWidth
                compact
              />
              <SelectField
                label={t("screens4_8.workers.profiles.tokenPolicyLabel")}
                value={tokenPolicy}
                onChange={(value) => setTokenPolicy(value as TokenPolicy)}
                options={TOKEN_POLICY_OPTIONS.map((option) => ({ value: option.value, label: t(`screens4_8.workers.profiles.${option.labelKey}`) }))}
                variant="outlined"
                size="small"
                description={t("screens4_8.workers.profiles.tokenPolicyHelp")}
              />
              <NumberField
                label={t("screens4_8.workers.profiles.maxLifetimeLabel")}
                value={maxLifetime}
                onChange={(e) => setMaxLifetime(e.target.value)}
                helperText={t("screens4_8.workers.profiles.maxLifetimeHelp")}
                fullWidth
                compact
              />
            </FlexColumn>
          </CollapsibleSection>
        </FormSection>
      </FlexColumn>
    </Dialog>
  );
};

export default memo(WorkerProfilesDialog);
