/** @jsxImportSource @emotion/react */
/**
 * The DAW-mode bottom dock: Mixer, Devices, Piano roll and Harmony tabs over
 * the full width of the editor.
 *
 * The dock follows the editing: double-clicking a midi clip (anything that
 * opens the piano roll) switches to the Piano roll tab, a track header's
 * instrument button switches to Devices on that track, and selecting a clip
 * on an audio or midi track focuses that track's device chain.
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import PianoOutlinedIcon from "@mui/icons-material/PianoOutlined";
import QueueMusicOutlinedIcon from "@mui/icons-material/QueueMusicOutlined";

import { useTimelineStore, useTimelineStoreApi } from "../../../../stores/timeline/TimelineStore";
import { useTimelineUIStore, useTimelineUIStoreApi } from "../../../../stores/timeline/TimelineUIStore";
import {
  useTimelineLayoutStore,
  type DawDockTab
} from "../../../../stores/timeline/TimelineLayoutStore";
import PanelErrorBoundary from "../../../common/PanelErrorBoundary";
import { EditorButton, EmptyState, FlexColumn, TabGroup, type TabItem } from "../../../ui_primitives";
import { PianoRollPanel } from "../../pianoRoll/PianoRollPanel";
import { MixerView } from "../mixer/MixerView";
import { HarmonyPanel } from "../harmony/HarmonyPanel";
import { DeviceChainView, isDeviceTrack, type DeviceTarget } from "./DeviceChainView";

const DOCK_TABS: TabItem[] = [
  { value: "mixer", label: "Mixer", icon: <TuneOutlinedIcon fontSize="small" /> },
  { value: "devices", label: "Devices", icon: <ExtensionOutlinedIcon fontSize="small" /> },
  { value: "pianoRoll", label: "Piano roll", icon: <PianoOutlinedIcon fontSize="small" /> },
  { value: "harmony", label: "Harmony", icon: <QueueMusicOutlinedIcon fontSize="small" /> }
];

const dockStyles = (theme: Theme) =>
  css({
    flexShrink: 0,
    minHeight: 0,
    overflow: "hidden",
    backgroundColor: theme.vars.palette.background.default,
    borderTop: `1px solid ${theme.vars.palette.divider}`
  });

/**
 * The channel the Devices tab shows. Starts on the first audio or midi track
 * and follows the clip selection and the track headers' instrument button.
 */
function useDeviceTarget(): [DeviceTarget | null, (target: DeviceTarget) => void] {
  const uiApi = useTimelineUIStoreApi();
  const docApi = useTimelineStoreApi();
  const setTab = useTimelineLayoutStore((s) => s.setDawDockTab);
  const firstDeviceTrackId = useTimelineStore(
    (s) => s.tracks.find(isDeviceTrack)?.id ?? null
  );
  const [target, setTarget] = useState<DeviceTarget | null>(null);

  useEffect(
    () =>
      uiApi.subscribe((state, previous) => {
        if (
          state.expandedInstrumentTrackId !== previous.expandedInstrumentTrackId &&
          state.expandedInstrumentTrackId
        ) {
          setTarget({ kind: "track", trackId: state.expandedInstrumentTrackId });
          setTab("devices");
          return;
        }
        if (state.selectedClipIds === previous.selectedClipIds) return;
        const doc = docApi.getState();
        for (const clipId of state.selectedClipIds) {
          const clip = doc.clips.find((c) => c.id === clipId);
          const track = clip && doc.tracks.find((t) => t.id === clip.trackId);
          if (track && isDeviceTrack(track)) {
            setTarget({ kind: "track", trackId: track.id });
            return;
          }
        }
      }),
    [uiApi, docApi, setTab]
  );

  const resolved = target ?? (firstDeviceTrackId ? { kind: "track" as const, trackId: firstDeviceTrackId } : null);
  return [resolved, setTarget];
}

/** Piano roll tab: the clip the roll is open on, or a way to open one. */
const PianoRollTab: React.FC = memo(() => {
  const clipId = useTimelineUIStore((s) => s.pianoRollClipId);
  const openPianoRoll = useTimelineUIStore((s) => s.openPianoRoll);
  const selectedIds = useTimelineUIStore((s) => s.selectedClipIds);
  const selectedMidiClipId = useTimelineStore(
    (s) => s.clips.find((c) => c.mediaType === "midi" && selectedIds.has(c.id))?.id ?? null
  );
  if (clipId) return <PianoRollPanel docked />;
  return (
    <FlexColumn align="center" justify="center" fullHeight fullWidth>
      <EmptyState
        title="No clip open"
        description="Double-click a MIDI clip to edit its notes here."
      />
      {selectedMidiClipId && (
        <EditorButton variant="outlined" size="small" onClick={() => openPianoRoll(selectedMidiClipId)}>
          Edit the selected clip
        </EditorButton>
      )}
    </FlexColumn>
  );
});
PianoRollTab.displayName = "PianoRollTab";

export interface DawDockProps {
  heightPx: number;
}

export const DawDock: React.FC<DawDockProps> = memo(({ heightPx }) => {
  const theme = useTheme();
  const tab = useTimelineLayoutStore((s) => s.dawDockTab);
  const setTab = useTimelineLayoutStore((s) => s.setDawDockTab);
  const uiApi = useTimelineUIStoreApi();
  const [deviceTarget, setDeviceTarget] = useDeviceTarget();

  // Opening the piano roll anywhere brings its tab forward.
  useEffect(
    () =>
      uiApi.subscribe((state, previous) => {
        if (state.pianoRollClipId && state.pianoRollClipId !== previous.pianoRollClipId) {
          setTab("pianoRoll");
        }
      }),
    [uiApi, setTab]
  );

  const dockCss = useMemo(() => dockStyles(theme), [theme]);
  const handleTab = useCallback((value: string) => setTab(value as DawDockTab), [setTab]);

  return (
    <FlexColumn
      fullWidth
      css={dockCss}
      sx={{ height: heightPx }}
      data-testid="daw-dock"
      role="region"
      aria-label="DAW dock"
    >
      <TabGroup
        tabs={DOCK_TABS}
        value={tab}
        onChange={handleTab}
        size="small"
        sx={{ flexShrink: 0, borderBottom: `1px solid ${theme.vars.palette.divider}` }}
      />
      <FlexColumn fullWidth sx={{ flex: "1 1 0", minHeight: 0, overflow: "hidden" }}>
        <PanelErrorBoundary panelName={DOCK_TABS.find((t) => t.value === tab)?.label ?? "Dock"}>
          {tab === "mixer" ? (
            <MixerView />
          ) : tab === "devices" ? (
            <DeviceChainView target={deviceTarget} onTargetChange={setDeviceTarget} />
          ) : tab === "pianoRoll" ? (
            <PianoRollTab />
          ) : (
            <HarmonyPanel />
          )}
        </PanelErrorBoundary>
      </FlexColumn>
    </FlexColumn>
  );
});

DawDock.displayName = "DawDock";
