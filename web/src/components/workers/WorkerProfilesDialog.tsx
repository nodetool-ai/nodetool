import React, { memo, useCallback, useState } from "react";
import {
  FlexColumn,
  FlexRow,
  Card,
  Text,
  Caption,
  Chip,
  Dialog,
  EditorButton,
  TextInput,
  SelectField,
  CollapsibleSection,
  AlertBanner,
  WarningBanner
} from "../ui_primitives";
import type {
  CreateWorkerProfileInput,
  WorkerProfile,
  WorkerTarget,
  TokenPolicy
} from "../../hooks/useWorkers";

// The secret each provider's API needs before a worker can be provisioned.
const API_KEY_BY_TARGET: Record<WorkerTarget, string> = {
  runpod: "RUNPOD_API_KEY",
  vast: "VAST_API_KEY"
};

// A profile is a reusable template (target, image, GPU spec, token policy,
// lifecycle limits); provisioning rents a GPU box from it.

// The default NodeTool worker image. Editable — only override if you publish
// your own build of `python -m nodetool.worker`.
const DEFAULT_WORKER_IMAGE = "ghcr.io/nodetool-ai/worker:latest";
const DEFAULT_IDLE_TIMEOUT = "30";
// Persistent volume default — big enough for several HF image models. Models
// download here and survive a stop/resume.
const DEFAULT_DISK_GB = "100";

// Sentinel select value that reveals a free-text GPU id field for ids not in
// the curated list below.
const CUSTOM_GPU = "__custom__";

const TARGET_OPTIONS = [
  { value: "runpod", label: "RunPod" },
  { value: "vast", label: "Vast" }
] as const;

// GPU ids are PROVIDER-NATIVE and differ per target: RunPod wants the full
// `gpuTypeId` ("NVIDIA A40"), Vast wants its short `gpu_name` ("A40"). The
// dropdowns map a friendly "name · VRAM" label to the exact id each API needs,
// so the user never has to know the raw string. Ordered by VRAM.
const RUNPOD_GPU_OPTIONS = [
  { value: "NVIDIA RTX A5000", label: "RTX A5000 · 24 GB" },
  { value: "NVIDIA GeForce RTX 4090", label: "RTX 4090 · 24 GB" },
  { value: "NVIDIA L4", label: "L4 · 24 GB" },
  { value: "NVIDIA RTX A6000", label: "RTX A6000 · 48 GB" },
  { value: "NVIDIA A40", label: "A40 · 48 GB" },
  { value: "NVIDIA L40S", label: "L40S · 48 GB" },
  { value: "NVIDIA A100 80GB PCIe", label: "A100 · 80 GB" },
  { value: "NVIDIA H100 80GB HBM3", label: "H100 · 80 GB" },
  { value: CUSTOM_GPU, label: "Other (enter GPU id)…" }
] as const;

// Vast searches the marketplace, so "Any" (empty id) is valid and picks the
// cheapest offer. RunPod provisions a specific pod type, so a GPU is required.
const VAST_GPU_OPTIONS = [
  { value: "", label: "Any (cheapest offer)" },
  { value: "RTX_3090", label: "RTX 3090 · 24 GB" },
  { value: "RTX_4090", label: "RTX 4090 · 24 GB" },
  { value: "RTX_A6000", label: "RTX A6000 · 48 GB" },
  { value: "A40", label: "A40 · 48 GB" },
  { value: "L40S", label: "L40S · 48 GB" },
  { value: "A100_PCIE", label: "A100 · 80 GB" },
  { value: "A100_SXM4", label: "A100 SXM4 · 80 GB" },
  { value: "H100_PCIE", label: "H100 · 80 GB" },
  { value: CUSTOM_GPU, label: "Other (enter GPU id)…" }
] as const;

// Default GPU per target: a solid mid-range card for RunPod (required), and
// "Any cheapest" for Vast.
const DEFAULT_GPU: Record<WorkerTarget, string> = {
  runpod: "NVIDIA A40",
  vast: ""
};

const TOKEN_POLICY_OPTIONS = [
  { value: "generate", label: "Generate (recommended)" },
  { value: "fixed", label: "Fixed" }
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
  const [name, setName] = useState("");
  const [target, setTarget] = useState<WorkerTarget>("runpod");
  const [image, setImage] = useState(DEFAULT_WORKER_IMAGE);
  // `gpu` holds the select value (a provider id, "" for Any, or CUSTOM_GPU);
  // `customGpu` holds the free-text id when CUSTOM_GPU is picked.
  const [gpu, setGpu] = useState(DEFAULT_GPU.runpod);
  const [customGpu, setCustomGpu] = useState("");
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
  const apiKeyName = API_KEY_BY_TARGET[target];
  const apiKeyMissing = apiKeyStatus?.[target] === false;

  const gpuOptions = target === "runpod" ? RUNPOD_GPU_OPTIONS : VAST_GPU_OPTIONS;
  // The provider-native GPU id we'll actually submit ("" means "any/none").
  const resolvedGpu = gpu === CUSTOM_GPU ? customGpu.trim() : gpu;
  // RunPod must provision a specific GPU pod; Vast can take "Any".
  const gpuOk = target === "vast" || resolvedGpu.length > 0;

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
    const spec: Record<string, unknown> = {};
    if (resolvedGpu) {
      spec.gpu = resolvedGpu;
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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [
    canCreate,
    name,
    target,
    image,
    resolvedGpu,
    disk,
    tokenPolicy,
    idleTimeout,
    maxLifetime,
    createProfile,
    resetForm
  ]);

  const handleDelete = useCallback(
    async (profileName: string) => {
      setBusy(true);
      setError(null);
      try {
        await deleteProfile(profileName);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [deleteProfile]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Manage worker profiles"
      minWidth={480}
      actions={
        <FlexRow gap={2}>
          <EditorButton variant="text" onClick={onClose}>
            Close
          </EditorButton>
          <EditorButton
            variant="outlined"
            onClick={handleCreate}
            disabled={!canCreate}
            aria-label="Create profile"
          >
            Create Profile
          </EditorButton>
        </FlexRow>
      }
    >
      <FlexColumn gap={3} sx={{ pt: 1 }}>
        {error && (
          <AlertBanner
            severity="error"
            compact
            onClose={() => setError(null)}
          >
            {error}
          </AlertBanner>
        )}

        <FlexColumn gap={1}>
          <Text size="small" weight={600}>
            Existing profiles
          </Text>
          {profiles.length === 0 ? (
            <Caption size="small">
              No profiles yet. Create one below.
            </Caption>
          ) : (
            profiles.map((profile) => (
              <Card key={profile.id} variant="outlined" padding="compact">
                <FlexRow align="center" justify="space-between" gap={2}>
                  <FlexColumn gap={0.5}>
                    <FlexRow gap={1.5} align="center">
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
                    aria-label={`Delete profile ${profile.name}`}
                    onClick={() => handleDelete(profile.name)}
                  >
                    Delete
                  </EditorButton>
                </FlexRow>
              </Card>
            ))
          )}
        </FlexColumn>

        <FlexColumn gap={2}>
          <FlexColumn gap={0.5}>
            <Text size="small" weight={600}>
              Create a profile
            </Text>
            <Caption size="small">
              A profile is a saved template. Provisioning it rents one GPU box
              and connects this app to it.
            </Caption>
          </FlexColumn>

          <TextInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            helperText="A label to recognise this template, e.g. “A40 image worker”."
            fullWidth
            compact
          />

          <SelectField
            label="Provider"
            value={target}
            onChange={(value) => handleTargetChange(value as WorkerTarget)}
            options={TARGET_OPTIONS}
            variant="outlined"
            size="small"
            description="Where the GPU is rented. RunPod runs a dedicated pod; Vast picks the cheapest matching offer on its marketplace."
          />

          {apiKeyMissing && (
            <WarningBanner
              compact
              message={`No ${apiKeyName} configured`}
              description={`Add it in Settings → API Keys before provisioning a ${
                target === "runpod" ? "RunPod" : "Vast.ai"
              } worker — provisioning fails without it.`}
            />
          )}

          <SelectField
            label="GPU"
            value={gpu}
            onChange={setGpu}
            options={gpuOptions}
            variant="outlined"
            size="small"
            description="Which GPU to rent. More VRAM runs larger models; pick the smallest that fits to save money."
          />
          {gpu === CUSTOM_GPU && (
            <TextInput
              label={
                target === "runpod"
                  ? "GPU id (RunPod gpuTypeId)"
                  : "GPU id (Vast gpu_name)"
              }
              value={customGpu}
              onChange={(e) => setCustomGpu(e.target.value)}
              helperText={
                target === "runpod"
                  ? "Exact RunPod id, e.g. “NVIDIA RTX 6000 Ada Generation”."
                  : "Exact Vast name, e.g. “RTX_6000Ada”."
              }
              fullWidth
              compact
            />
          )}

          <TextInput
            label="Disk (GB)"
            value={disk}
            onChange={(e) => setDisk(e.target.value)}
            type="number"
            helperText="Persistent volume for the model cache. Models download here once and survive a stop/resume. HF models are large — keep this generous."
            fullWidth
            compact
          />

          <TextInput
            label="Idle timeout (minutes)"
            value={idleTimeout}
            onChange={(e) => setIdleTimeout(e.target.value)}
            type="number"
            helperText="Idle this long → pause (GPU freed, volume + models kept). Your main guard against runaway GPU bills. Blank = never."
            fullWidth
            compact
          />

          <CollapsibleSection
            title={
              <Text size="small" weight={600}>
                Advanced
              </Text>
            }
            defaultOpen={false}
          >
            <FlexColumn gap={2} sx={{ pt: 1 }}>
              <TextInput
                label="Worker image"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                helperText="Container image the provider runs. Keep the default unless you publish your own worker build."
                fullWidth
                compact
              />
              <SelectField
                label="Token policy"
                value={tokenPolicy}
                onChange={(value) => setTokenPolicy(value as TokenPolicy)}
                options={TOKEN_POLICY_OPTIONS}
                variant="outlined"
                size="small"
                description="Generate issues a fresh auth token per worker (recommended). Fixed reuses a token you set elsewhere."
              />
              <TextInput
                label="Max lifetime (minutes)"
                value={maxLifetime}
                onChange={(e) => setMaxLifetime(e.target.value)}
                type="number"
                helperText="Hard cap: at this age the worker is TERMINATED — pod and volume destroyed (models lost) — to stop all billing. Blank = no cap."
                fullWidth
                compact
              />
            </FlexColumn>
          </CollapsibleSection>
        </FlexColumn>
      </FlexColumn>
    </Dialog>
  );
};

export default memo(WorkerProfilesDialog);
