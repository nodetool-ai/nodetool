import React from "react";
import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../stores/timeline/TimelineUIStore";
import { Caption, FlexColumn, SelectField, SPACING } from "../ui_primitives";
import { TrackInstrumentPanel } from "./Tracks/TrackInstrumentPanel";

export function TimelineInstrumentsPanel() {
  const tracks = useTimelineStore(state => state.tracks);
  const clips = useTimelineStore(state => state.clips);
  const selected = useTimelineUIStore(state => state.selectedClipIds);
  const instrumentTrackId = useTimelineUIStore(state => state.expandedInstrumentTrackId);
  const openInstrument = useTimelineUIStore(state => state.toggleExpandedInstrument);
  const midiTracks = tracks.filter(track => track.type === "midi");
  const selectedTrack = clips.find(clip => selected.has(clip.id))?.trackId;
  const track = midiTracks.find(track => track.id === instrumentTrackId)
    ?? midiTracks.find(track => track.id === selectedTrack) ?? midiTracks[0];
  if (!track) return <Caption sx={{ p: SPACING.md }}>Add a MIDI track to choose an instrument.</Caption>;
  return <FlexColumn fullHeight sx={{ minHeight: 0 }} data-testid="timeline-instruments-panel">
    <FlexColumn sx={{ p: SPACING.sm }}>
      <SelectField label="Instrument track" hideLabel size="small" value={track.id}
        options={midiTracks.map(track => ({value: track.id, label: track.name}))} onChange={openInstrument} />
    </FlexColumn>
    <TrackInstrumentPanel key={track.id} trackId={track.id} />
  </FlexColumn>;
}
