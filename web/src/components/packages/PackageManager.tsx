/**
 * PackageManager — the unified "install everything here" surface.
 *
 * Brings the three install domains under one roof:
 *  - **Software** — system runtimes (Python, FFmpeg, …) via Electron IPC
 *    ({@link RuntimePackagesSection}).
 *  - **Node Packs** — first-party builtins, third-party npm packs, and trust
 *    ({@link PackagesMenu}).
 *  - **Models** — AI model downloads, managed in the Model Manager.
 *
 * Replaces the old standalone Packages tab in Settings.
 */
import { memo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  FlexColumn,
  FlexRow,
  Text,
  EditorButton,
  ToggleGroup,
  ToggleOption
} from "../ui_primitives";
import RuntimePackagesSection from "./RuntimePackagesSection";
import PackagesMenu from "../menus/PackagesMenu";

type Section = "software" | "packs" | "models";

const ModelsSection = memo(function ModelsSection() {
  const navigate = useNavigate();
  return (
    <FlexColumn gap={1.5}>
      <Text size="small" color="secondary">
        AI models (HuggingFace, Ollama, and local engines) are downloaded and
        managed in the Model Manager, with live progress and cache status.
      </Text>
      <FlexRow>
        <EditorButton variant="contained" onClick={() => navigate("/models")}>
          Open Model Manager
        </EditorButton>
      </FlexRow>
    </FlexColumn>
  );
});

function PackageManager() {
  const [section, setSection] = useState<Section>("packs");

  return (
    <FlexColumn gap={2} sx={{ maxWidth: 900 }}>
      <FlexColumn gap={1} sx={{ p: 2, pb: 0 }}>
        <Text size="big" weight={600}>
          Package Manager
        </Text>
        <Text size="small" color="secondary">
          Install runtimes, node packs, and models in one place.
        </Text>
        <ToggleGroup
          value={section}
          exclusive
          compact
          onChange={(_, value) => {
            if (value) setSection(value as Section);
          }}
        >
          <ToggleOption value="software">Software</ToggleOption>
          <ToggleOption value="packs">Node Packs</ToggleOption>
          <ToggleOption value="models">Models</ToggleOption>
        </ToggleGroup>
      </FlexColumn>

      {section === "packs" ? (
        <PackagesMenu />
      ) : (
        <FlexColumn sx={{ p: 2, pt: 0 }}>
          {section === "software" ? <RuntimePackagesSection /> : <ModelsSection />}
        </FlexColumn>
      )}
    </FlexColumn>
  );
}

export default memo(PackageManager);
