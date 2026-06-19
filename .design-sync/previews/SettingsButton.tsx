import * as React from "react";
import { SettingsButton, FlexRow } from "nodetool";

export const IconVariants = () => (
  <FlexRow gap={2} align="center">
    <SettingsButton onClick={() => {}} iconVariant="settings" tooltip="Settings" />
    <SettingsButton onClick={() => {}} iconVariant="tune" tooltip="Tune" />
    <SettingsButton onClick={() => {}} iconVariant="moreVert" tooltip="More" />
    <SettingsButton onClick={() => {}} iconVariant="moreHoriz" tooltip="More" />
  </FlexRow>
);

export const Sizes = () => (
  <FlexRow gap={2} align="center">
    <SettingsButton onClick={() => {}} buttonSize="small" />
    <SettingsButton onClick={() => {}} buttonSize="medium" />
    <SettingsButton onClick={() => {}} buttonSize="large" />
    <SettingsButton onClick={() => {}} disabled />
  </FlexRow>
);
