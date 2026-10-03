import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTimeOrderedUuid,
  type SamplerMidiInstrument,
  type SamplerZone
} from "@nodetool-ai/timeline";
import { useAssetUpload } from "../../../serverState/useAssetUpload";
import {
  useWorkspaceTabsStore,
  LOOSE_PROJECT_ID
} from "../../../stores/WorkspaceTabsStore";
import { trpcClient } from "../../../trpc/client";
import {
  Button,
  Caption,
  FlexColumn,
  FlexRow,
  FormField,
  Label,
  NumericField,
  SelectField,
  SPACING
} from "../../ui_primitives";

interface SamplerInstrumentEditorProps {
  readonly instrument: SamplerMidiInstrument;
  readonly onChange: (
    instrument: SamplerMidiInstrument,
    pitch?: number
  ) => void;
}

export default function SamplerInstrumentEditor({
  instrument,
  onChange
}: SamplerInstrumentEditorProps): React.JSX.Element {
  const [selected, setSelected] = useState("");
  const [mapping, setMapping] = useState("drum");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const uploadAsset = useAssetUpload((state) => state.uploadAsset);
  const projectId =
    useWorkspaceTabsStore((state) => state.activeProjectId) ?? LOOSE_PROJECT_ID;
  const queryClient = useQueryClient();
  const queryKey = ["sampler-assets", projectId];
  const assets = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await trpcClient.assets.search.query({
        query: "",
        page_size: 500,
        project_id: projectId
      });
      return result.assets.filter((asset) =>
        asset.content_type?.startsWith("audio/")
      );
    },
    staleTime: 30000
  });
  const add = (assetId: string, name: string): void => {
    let root = mapping === "drum" ? 36 : 60;
    if (mapping === "drum") {
      const occupied = new Set(
        instrument.zones
          .filter((zone) => zone.lowNote === zone.highNote)
          .map((zone) => zone.lowNote)
      );
      while (occupied.has(root) && root < 127) root++;
    }
    onChange(
      {
        ...instrument,
        zones: [
          ...instrument.zones,
          {
            id: createTimeOrderedUuid(),
            name,
            assetId,
            rootNote: root,
            lowNote: mapping === "drum" ? root : 0,
            highNote: mapping === "drum" ? root : 127,
            gainDb: 0
          }
        ]
      },
      root
    );
    setSelected("");
  };
  const update = (zone: SamplerZone, patch: Partial<SamplerZone>): void => {
    const updated = { ...zone, ...patch };
    onChange(
      {
        ...instrument,
        zones: instrument.zones.map((current) =>
          current.id === zone.id ? updated : current
        )
      },
      Math.max(updated.lowNote, Math.min(updated.highNote, updated.rootNote))
    );
  };
  return (
    <FlexColumn gap={SPACING.lg}>
      <Label>Sampler</Label>
      <Caption color="muted">
        Load recordings up to 60 seconds. Drum mappings play on one key. Pitched
        mappings transpose from the root note. Overlapping ranges layer samples.
        Stereo recordings are mixed to mono.
      </Caption>
      <SelectField
        label="New sample mapping"
        value={mapping}
        options={[
          { value: "drum", label: "Drum · one key" },
          { value: "pitched", label: "Pitched · full keyboard" }
        ]}
        onChange={setMapping}
      />
      <SelectField
        label="Audio sample"
        value={selected}
        options={[
          {
            value: "",
            label: assets.isLoading
              ? "Loading samples…"
              : "Choose an audio asset"
          },
          ...(assets.data ?? []).map((asset) => ({
            value: asset.id,
            label: asset.name
          }))
        ]}
        onChange={setSelected}
      />
      <FlexRow gap={SPACING.md}>
        <Button
          disabled={!selected || uploading || instrument.zones.length >= 32}
          onClick={() => {
            const asset = assets.data?.find((item) => item.id === selected);
            if (asset) add(asset.id, asset.name);
          }}
        >
          Add sample
        </Button>
        <Button
          disabled={uploading || instrument.zones.length >= 32}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? "Uploading…" : "Upload audio"}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="audio/*,.wav,.flac,.mp3,.ogg,.m4a"
          hidden
          aria-label="Upload sampler audio"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setError("");
            setUploading(true);
            uploadAsset({
              file,
              project_id: projectId,
              onCompleted: (asset) => {
                void queryClient.invalidateQueries({ queryKey });
                if (!mounted.current) return;
                setUploading(false);
                // Select the upload for explicit mapping, so edits made during upload are preserved.
                setSelected(asset.id);
              },
              onFailed: (message) => {
                if (mounted.current) {
                  setError(message);
                  setUploading(false);
                }
              }
            });
          }}
        />
      </FlexRow>
      {(error || assets.error) && (
        <Caption role="alert">
          {error || "Could not load audio assets."}
        </Caption>
      )}
      <SelectField
        label="Playback"
        value={instrument.oneShot ? "one-shot" : "gated"}
        options={[
          { value: "one-shot", label: "One-shot · play full sample" },
          { value: "gated", label: "Gated · release at note-off" }
        ]}
        onChange={(value) =>
          onChange({ ...instrument, oneShot: value === "one-shot" })
        }
      />
      <FlexRow gap={SPACING.md}>
        <FormField label="Attack (ms)" compact sx={{ flex: 1, minWidth: 0 }}>
          <NumericField
            label="Attack (ms)"
            value={instrument.attackMs}
            min={0}
            max={10000}
            onCommit={(value) =>
              onChange({
                ...instrument,
                attackMs: Math.max(0, Math.min(10000, value))
              })
            }
          />
        </FormField>
        <FormField label="Release (ms)" compact sx={{ flex: 1, minWidth: 0 }}>
          <NumericField
            label="Release (ms)"
            value={instrument.releaseMs}
            min={0}
            max={30000}
            onCommit={(value) =>
              onChange({
                ...instrument,
                releaseMs: Math.max(0, Math.min(30000, value))
              })
            }
          />
        </FormField>
        <FormField label="Gain (dB)" compact sx={{ flex: 1, minWidth: 0 }}>
          <NumericField
            label="Gain (dB)"
            value={instrument.gainDb}
            min={-60}
            max={12}
            onCommit={(value) =>
              onChange({
                ...instrument,
                gainDb: Math.max(-60, Math.min(12, value))
              })
            }
          />
        </FormField>
      </FlexRow>
      {instrument.zones.map((zone) => (
        <FlexColumn key={zone.id} gap={SPACING.md}>
          <Label>{zone.name}</Label>
          <FlexRow gap={SPACING.md}>
            <FormField label="Root note" compact sx={{ flex: 1, minWidth: 0 }}>
              <NumericField
                label={`${zone.name} root note`}
                value={zone.rootNote}
                min={0}
                max={127}
                integer
                onCommit={(value) => {
                  const rootNote = Math.max(0, Math.min(127, value));
                  update(
                    zone,
                    zone.lowNote === zone.highNote
                      ? { rootNote, lowNote: rootNote, highNote: rootNote }
                      : { rootNote }
                  );
                }}
              />
            </FormField>
            <FormField label="Lowest key" compact sx={{ flex: 1, minWidth: 0 }}>
              <NumericField
                label={`${zone.name} lowest key`}
                value={zone.lowNote}
                min={0}
                max={zone.highNote}
                integer
                onCommit={(value) =>
                  update(zone, {
                    lowNote: Math.max(0, Math.min(zone.highNote, value))
                  })
                }
              />
            </FormField>
            <FormField
              label="Highest key"
              compact
              sx={{ flex: 1, minWidth: 0 }}
            >
              <NumericField
                label={`${zone.name} highest key`}
                value={zone.highNote}
                min={zone.lowNote}
                max={127}
                integer
                onCommit={(value) =>
                  update(zone, {
                    highNote: Math.max(zone.lowNote, Math.min(127, value))
                  })
                }
              />
            </FormField>
          </FlexRow>
          <FormField label="Gain (dB)" compact sx={{ flex: 1, minWidth: 0 }}>
            <NumericField
              label={`${zone.name} gain (dB)`}
              value={zone.gainDb}
              min={-60}
              max={12}
              onCommit={(value) =>
                update(zone, { gainDb: Math.max(-60, Math.min(12, value)) })
              }
            />
          </FormField>
          <FlexRow gap={SPACING.md}>
            <Button
              onClick={() =>
                onChange(
                  instrument,
                  Math.max(zone.lowNote, Math.min(zone.highNote, zone.rootNote))
                )
              }
            >
              Play {zone.name}
            </Button>
            <Button
              onClick={() =>
                onChange({
                  ...instrument,
                  zones: instrument.zones.filter((item) => item.id !== zone.id)
                })
              }
            >
              Remove {zone.name}
            </Button>
          </FlexRow>
        </FlexColumn>
      ))}
      {!instrument.zones.length && (
        <Caption color="muted">
          Add a recording to play this instrument.
        </Caption>
      )}
    </FlexColumn>
  );
}
