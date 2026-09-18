/**
 * Icons for the `+ New` menu's guided flows.
 *
 * Every row in the menu shows one. Where a blank-document entry exists for
 * the same kind (storyboard, timeline, script, sketch, workflow) the glyph
 * matches the catalog's, so one kind reads as one icon wherever it appears
 * in the menu. Entity reuses quick access's person glyph; game gets the
 * sports-esports glyph, which nothing else in the menu uses.
 *
 * Size is deliberately unset here: the menu's container pins every
 * `.MuiSvgIcon-root` to 16px, so these stay uniform with the catalog's icons
 * without restating the size per glyph.
 */

import type { ReactNode } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import MovieOutlinedIcon from "@mui/icons-material/MovieOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
import RecordVoiceOverOutlinedIcon from "@mui/icons-material/RecordVoiceOverOutlined";
import SportsEsportsOutlinedIcon from "@mui/icons-material/SportsEsportsOutlined";

import type { EntryFlowId } from "../setup/entryCards";

export const GUIDED_FLOW_ICONS: Record<EntryFlowId, ReactNode> = {
  entity: <PersonOutlineOutlinedIcon fontSize="small" />,
  storyboard: <DashboardOutlinedIcon fontSize="small" />,
  video: <MovieOutlinedIcon fontSize="small" />,
  script: <RecordVoiceOverOutlinedIcon fontSize="small" />,
  image: <ImageOutlinedIcon fontSize="small" />,
  workflow: <AddRoundedIcon fontSize="small" />,
  game: <SportsEsportsOutlinedIcon fontSize="small" />
};
