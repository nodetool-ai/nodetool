import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CodeIcon from "@mui/icons-material/Code";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import MovieCreationOutlinedIcon from "@mui/icons-material/MovieCreationOutlined";
import MovieFilterOutlinedIcon from "@mui/icons-material/MovieFilterOutlined";
import PianoOutlinedIcon from "@mui/icons-material/PianoOutlined";
import SubtitlesOutlinedIcon from "@mui/icons-material/SubtitlesOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import ViewTimelineOutlinedIcon from "@mui/icons-material/ViewTimelineOutlined";
import LiveTvOutlinedIcon from "@mui/icons-material/LiveTvOutlined";
import type { TFunction } from "i18next";

import type { DockPanelRegistration } from "../../dock/panelRegistry";
import type { TimelinePanelId } from "../../../stores/timeline/TimelineDockLayout";

type TimelinePanelRegistration = DockPanelRegistration & { readonly id: TimelinePanelId };

const icon = { fontSize: "small" } as const;

/** The panels the timeline dock can hold. In DAW mode the program panel holds the DAW workspace. */
export function timelinePanelRegistrations(dawMode: boolean, t?: TFunction): readonly TimelinePanelRegistration[] {
  const translate = (key: string, fallback: string): string => t ? t(key) : fallback;
  return [
    { id: "program", title: dawMode ? translate("batch2_27.panels.daw", "DAW") : translate("batch2_27.panels.program", "Program"), icon: <LiveTvOutlinedIcon {...icon} />, defaultRegion: "viewport" },
    { id: "source", title: translate("batch2_27.panels.source", "Source"), icon: <MovieFilterOutlinedIcon {...icon} />, defaultRegion: "viewport" },
    { id: "tracks", title: translate("batch2_27.panels.timeline", "Timeline"), icon: <ViewTimelineOutlinedIcon {...icon} />, defaultRegion: "bottom" },
    { id: "transcript", title: translate("batch2_27.panels.script", "Script"), icon: <SubtitlesOutlinedIcon {...icon} />, defaultRegion: "left" },
    { id: "inspector", title: translate("batch2_27.panels.inspector", "Inspector"), icon: <TuneOutlinedIcon {...icon} />, defaultRegion: "right" },
    { id: "shot", title: translate("batch2_27.panels.shot", "Shot"), icon: <MovieCreationOutlinedIcon {...icon} />, defaultRegion: "right" },
    { id: "instruments", title: translate("batch2_27.panels.instruments", "Instruments"), icon: <PianoOutlinedIcon {...icon} />, defaultRegion: "right" },
    { id: "assistant", title: translate("batch2_27.panels.assistant", "Assistant"), icon: <AutoAwesomeIcon {...icon} />, defaultRegion: "right" },
    { id: "history", title: translate("batch2_27.panels.history", "History"), icon: <HistoryOutlinedIcon {...icon} />, defaultRegion: "right" },
    { id: "code", title: translate("batch2_27.panels.code", "Code"), icon: <CodeIcon {...icon} />, defaultRegion: "right" }
  ];
}

/** What Open <panel> says when the panel has nothing to show yet. */
export function unavailablePanelNotice(id: TimelinePanelId, t?: TFunction): string {
  if (!t) {
    const fallbacks: Partial<Record<TimelinePanelId, string>> = {
      tracks: "DAW mode has its own track view. Turn it off (Alt+M) to open the Timeline panel.",
      source: "Select an asset in Assets to open it in Source.",
      shot: "Select a shot clip to open its Shot panel.",
      instruments: "Add a MIDI track to use Instruments.",
      code: "This timeline has no code.",
      transcript: "This timeline has no script."
    };
    return fallbacks[id] ?? `The ${id} panel has nothing to show yet.`;
  }
  const notices: Partial<Record<TimelinePanelId, string>> = {
  // Tracks has no view only in DAW mode, which lays out its own tracks.
    tracks: t("batch2_27.unavailable.tracks"),
    source: t("batch2_27.unavailable.source"),
    shot: t("batch2_27.unavailable.shot"),
    instruments: t("batch2_27.unavailable.instruments"),
    code: t("batch2_27.unavailable.code"),
    transcript: t("batch2_27.unavailable.transcript")
  };
  return notices[id] ?? t("batch2_27.unavailable.generic", { panel: id });
}
