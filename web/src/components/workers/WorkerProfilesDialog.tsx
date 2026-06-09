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
  AlertBanner
} from "../ui_primitives";
import type {
  CreateWorkerProfileInput,
  WorkerProfile,
  WorkerTarget,
  TokenPolicy
} from "../../hooks/useWorkers";

// A profile is a reusable template (target, image, GPU spec, token policy,
// lifecycle limits); provisioning rents a pod from it.

const TARGET_OPTIONS = [
  { value: "runpod", label: "RunPod" },
  { value: "vast", label: "Vast" }
] as const;

const TOKEN_POLICY_OPTIONS = [
  { value: "generate", label: "Generate" },
  { value: "fixed", label: "Fixed" }
] as const;

interface WorkerProfilesDialogProps {
  open: boolean;
  onClose: () => void;
  profiles: WorkerProfile[];
  createProfile: (input: CreateWorkerProfileInput) => Promise<WorkerProfile>;
  deleteProfile: (name: string) => Promise<void>;
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
  deleteProfile
}) => {
  const [name, setName] = useState("");
  const [target, setTarget] = useState<WorkerTarget>("runpod");
  const [image, setImage] = useState("");
  const [gpu, setGpu] = useState("");
  const [tokenPolicy, setTokenPolicy] = useState<TokenPolicy>("generate");
  const [idleTimeout, setIdleTimeout] = useState("");
  const [maxLifetime, setMaxLifetime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCreate = name.trim().length > 0 && image.trim().length > 0 && !busy;

  const resetForm = useCallback(() => {
    setName("");
    setTarget("runpod");
    setImage("");
    setGpu("");
    setTokenPolicy("generate");
    setIdleTimeout("");
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
    const gpuValue = gpu.trim();
    if (gpuValue) {
      input.spec = { gpu: gpuValue };
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
    gpu,
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
          <Text size="small" weight={600}>
            Create a profile
          </Text>
          <TextInput
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            compact
          />
          <FlexRow gap={2} align="flex-start">
            <FlexColumn sx={{ flex: 1, minWidth: 0 }}>
              <SelectField
                label="Target"
                value={target}
                onChange={(value) => setTarget(value as WorkerTarget)}
                options={TARGET_OPTIONS}
                variant="outlined"
                size="small"
              />
            </FlexColumn>
            <FlexColumn sx={{ flex: 1, minWidth: 0 }}>
              <SelectField
                label="Token policy"
                value={tokenPolicy}
                onChange={(value) => setTokenPolicy(value as TokenPolicy)}
                options={TOKEN_POLICY_OPTIONS}
                variant="outlined"
                size="small"
              />
            </FlexColumn>
          </FlexRow>
          <TextInput
            label="Image"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            fullWidth
            compact
          />
          <TextInput
            label="GPU"
            value={gpu}
            onChange={(e) => setGpu(e.target.value)}
            helperText="Optional — e.g. A40, A100. Stored as spec.gpu."
            fullWidth
            compact
          />
          <FlexRow gap={2} align="flex-start">
            <FlexColumn sx={{ flex: 1, minWidth: 0 }}>
              <TextInput
                label="Idle timeout (minutes)"
                value={idleTimeout}
                onChange={(e) => setIdleTimeout(e.target.value)}
                type="number"
                helperText="Optional — auto-stop after idle minutes."
                fullWidth
                compact
              />
            </FlexColumn>
            <FlexColumn sx={{ flex: 1, minWidth: 0 }}>
              <TextInput
                label="Max lifetime (minutes)"
                value={maxLifetime}
                onChange={(e) => setMaxLifetime(e.target.value)}
                type="number"
                helperText="Optional — hard cap on runtime."
                fullWidth
                compact
              />
            </FlexColumn>
          </FlexRow>
        </FlexColumn>
      </FlexColumn>
    </Dialog>
  );
};

export default memo(WorkerProfilesDialog);
