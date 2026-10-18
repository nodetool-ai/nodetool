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

import type { DockPanelRegistration } from "../../dock/panelRegistry";
import type { TimelinePanelId } from "../../../stores/timeline/TimelineDockLayout";

type TimelinePanelRegistration = DockPanelRegistration & { readonly id: TimelinePanelId };

const icon = { fontSize: "small" } as const;

/** The panels the timeline dock can hold. In DAW mode the program panel holds the DAW workspace. */
export function timelinePanelRegistrations(dawMode: boolean): readonly TimelinePanelRegistration[] {
  return [
    { id: "program", title: dawMode ? "DAW" : "Program", icon: <LiveTvOutlinedIcon {...icon} />, defaultRegion: "viewport" },
    { id: "source", title: "Source", icon: <MovieFilterOutlinedIcon {...icon} />, defaultRegion: "viewport" },
    { id: "tracks", title: "Timeline", icon: <ViewTimelineOutlinedIcon {...icon} />, defaultRegion: "bottom" },
    { id: "transcript", title: "Script", icon: <SubtitlesOutlinedIcon {...icon} />, defaultRegion: "left" },
    { id: "inspector", title: "Inspector", icon: <TuneOutlinedIcon {...icon} />, defaultRegion: "right" },
    { id: "shot", title: "Shot", icon: <MovieCreationOutlinedIcon {...icon} />, defaultRegion: "right" },
    { id: "instruments", title: "Instruments", icon: <PianoOutlinedIcon {...icon} />, defaultRegion: "right" },
    { id: "assistant", title: "Assistant", icon: <AutoAwesomeIcon {...icon} />, defaultRegion: "right" },
    { id: "history", title: "History", icon: <HistoryOutlinedIcon {...icon} />, defaultRegion: "right" },
    { id: "code", title: "Code", icon: <CodeIcon {...icon} />, defaultRegion: "right" }
  ];
}

/** What Open <panel> says when the panel has nothing to show yet. */
export const UNAVAILABLE_PANEL_NOTICE: Partial<Record<TimelinePanelId, string>> = {
  // Tracks has no view only in DAW mode, which lays out its own tracks.
  tracks: "DAW mode has its own track view. Turn it off (Alt+M) to open the Timeline panel.",
  source: "Select an asset in Assets to open it in Source.",
  shot: "Select a shot clip to open its Shot panel.",
  instruments: "Add a MIDI track to use Instruments.",
  code: "This timeline has no code.",
  transcript: "This timeline has no script."
};
