/** @jsxImportSource @emotion/react */
import React, { memo, useEffect, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import {
  Caption,
  FlexColumn,
  FlexRow,
  Text,
  ToggleGroup,
  ToggleOption,
  BORDER_RADIUS
} from "../../ui_primitives";
import { useShallow } from "zustand/react/shallow";
import type { UnifiedModel } from "../../../stores/ApiTypes";
import { useHfCacheStatusStore } from "../../../stores/HfCacheStatusStore";
import {
  buildHfCacheRequest,
  canCheckHfCache,
  getHfCacheKey
} from "../../../utils/hfCache";
import { useHardwareProfile } from "./useHardwareProfile";
import HardwareCard from "./HardwareCard";
import EngineGuide from "./EngineGuide";
import OnboardingModelRow from "./OnboardingModelRow";
import {
  CAPABILITY_LABELS,
  ONBOARDING_MODELS,
  sortModelsByFit,
  type OnboardingCapability
} from "./onboardingCatalog";

interface ModelOnboardingProps {
  /** Kicks off a real download through the shared download store. */
  onDownload: (model: UnifiedModel) => void;
}

type Filter = "all" | OnboardingCapability;

/** Capabilities in display order, only those that have catalog entries. */
const CAPABILITY_ORDER: OnboardingCapability[] = [
  "chat",
  "vision",
  "image",
  "speech-to-text",
  "text-to-speech",
  "embedding"
];

const ModelOnboarding: React.FC<ModelOnboardingProps> = ({ onDownload }) => {
  const theme = useTheme();
  const profile = useHardwareProfile();
  const [filter, setFilter] = useState<Filter>("all");

  const { cacheStatuses, cacheVersion, ensureStatuses } = useHfCacheStatusStore(
    useShallow((state) => ({
      cacheStatuses: state.statuses,
      cacheVersion: state.version,
      ensureStatuses: state.ensureStatuses
    }))
  );

  useEffect(() => {
    const requests = ONBOARDING_MODELS.map((entry) =>
      buildHfCacheRequest(entry.model)
    ).filter((request): request is NonNullable<typeof request> => request !== null);
    if (requests.length > 0) {
      void ensureStatuses(requests);
    }
  }, [ensureStatuses, cacheVersion]);

  const availableCapabilities = useMemo(() => {
    const present = new Set(ONBOARDING_MODELS.map((m) => m.capability));
    return CAPABILITY_ORDER.filter((c) => present.has(c));
  }, []);

  const groups = useMemo(() => {
    const caps =
      filter === "all" ? availableCapabilities : [filter as OnboardingCapability];
    return caps
      .map((capability) => {
        const entries = sortModelsByFit(
          ONBOARDING_MODELS.filter((m) => m.capability === capability),
          profile.budgetGb
        );
        return { capability, entries };
      })
      .filter((g) => g.entries.length > 0);
  }, [filter, availableCapabilities, profile.budgetGb]);

  const isDownloaded = (model: UnifiedModel): boolean =>
    canCheckHfCache(model) ? !!cacheStatuses[getHfCacheKey(model)] : false;

  return (
    <FlexColumn
      gap={3}
      sx={{ flex: 1, minHeight: 0, overflowY: "auto", pb: 4, pr: 1 }}
    >
      <FlexRow gap={1.5} align="center">
        <FlexRow
          align="center"
          justify="center"
          sx={{
            width: 40,
            height: 40,
            borderRadius: BORDER_RADIUS.md,
            backgroundColor: `rgba(${theme.vars.palette.primary.mainChannel} / 0.12)`,
            color: theme.vars.palette.primary.main
          }}
        >
          <RocketLaunchOutlinedIcon sx={{ fontSize: 22 }} />
        </FlexRow>
        <FlexColumn gap={0.25}>
          <Text size="big" weight={600}>
            Get started with local models
          </Text>
          <Caption sx={{ opacity: 0.7 }}>
            Run AI on your own machine — private, offline, and free. We match
            recommendations to your hardware.
          </Caption>
        </FlexColumn>
      </FlexRow>

      <HardwareCard profile={profile} />

      <EngineGuide />

      <FlexColumn gap={1.5}>
        <FlexColumn gap={0.25}>
          <Text size="big" weight={600}>
            Recommended models
          </Text>
          <Caption sx={{ opacity: 0.7 }}>
            Current models in the 2–30 GB range, sorted to show what fits your
            machine first. Sizes and memory are approximate.
          </Caption>
        </FlexColumn>

        <ToggleGroup
          value={filter}
          exclusive
          segmented
          onChange={(_e, value) => value && setFilter(value as Filter)}
          aria-label="filter recommended models by capability"
        >
          <ToggleOption value="all" aria-label="all capabilities">
            All
          </ToggleOption>
          {availableCapabilities.map((capability) => (
            <ToggleOption
              key={capability}
              value={capability}
              aria-label={CAPABILITY_LABELS[capability]}
            >
              {CAPABILITY_LABELS[capability]}
            </ToggleOption>
          ))}
        </ToggleGroup>

        {groups.map((group) => (
          <FlexColumn key={group.capability} gap={1} sx={{ mt: 1 }}>
            <Text size="small" weight={600} color="secondary">
              {CAPABILITY_LABELS[group.capability]}
            </Text>
            {group.entries.map((entry) => (
              <OnboardingModelRow
                key={entry.id}
                entry={entry}
                fit={profile.classify(entry.minVramGb)}
                downloaded={isDownloaded(entry.model)}
                onDownload={onDownload}
              />
            ))}
          </FlexColumn>
        ))}
      </FlexColumn>
    </FlexColumn>
  );
};

export default memo(ModelOnboarding);
