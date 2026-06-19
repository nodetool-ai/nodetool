import * as React from "react";
import { StateIconButton, FlexRow } from "nodetool";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import SaveIcon from "@mui/icons-material/Save";
import VisibilityIcon from "@mui/icons-material/Visibility";

export const States = () => (
  <FlexRow gap={2} align="center">
    <StateIconButton icon={<PlayArrowIcon />} tooltip="Run" onClick={() => {}} />
    <StateIconButton icon={<SaveIcon />} tooltip="Saving" isLoading onClick={() => {}} />
    <StateIconButton icon={<VisibilityIcon />} tooltip="Active" isActive onClick={() => {}} />
    <StateIconButton icon={<SaveIcon />} tooltip="Disabled" disabled onClick={() => {}} />
  </FlexRow>
);

export const Toggle = () => (
  <FlexRow gap={2} align="center">
    <StateIconButton
      icon={<FavoriteBorderIcon />}
      activeIcon={<FavoriteIcon />}
      tooltip="Favorite"
      onClick={() => {}}
    />
    <StateIconButton
      icon={<FavoriteBorderIcon />}
      activeIcon={<FavoriteIcon />}
      tooltip="Favorited"
      isActive
      color="error"
      onClick={() => {}}
    />
  </FlexRow>
);

export const Sizes = () => (
  <FlexRow gap={2} align="center">
    <StateIconButton icon={<PlayArrowIcon />} size="small" tooltip="Small" onClick={() => {}} />
    <StateIconButton icon={<PlayArrowIcon />} size="medium" tooltip="Medium" onClick={() => {}} />
    <StateIconButton icon={<PlayArrowIcon />} size="large" tooltip="Large" onClick={() => {}} />
  </FlexRow>
);
