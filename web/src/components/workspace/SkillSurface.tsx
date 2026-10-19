import { useSkill } from "../../hooks/skills/useSkills";
import { useTranslation } from "react-i18next";
import type { WorkspaceTabMode } from "../../stores/WorkspaceTabsStore";
import SkillEditorPane from "../skills/SkillEditorPane";
import ErrorBanner from "../support/ErrorBanner";
import {
  Caption,
  FlexColumn,
  Label,
  LoadingSpinner,
  ScrollArea,
  SPACING
} from "../ui_primitives";
import MarkdownRenderer from "../../utils/MarkdownRenderer";

interface SkillSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  active: boolean;
}

const SkillSurface = ({ refId, mode }: SkillSurfaceProps) => {
  const { t } = useTranslation("translation", { keyPrefix: "i18n-next106" });
  const { data: skill, isLoading, error } = useSkill(refId);

  if (isLoading) {
    return (
      <FlexColumn fullWidth fullHeight sx={{ alignItems: "center", justifyContent: "center" }}>
        <LoadingSpinner />
      </FlexColumn>
    );
  }
  if (error || !skill) {
    return (
      <FlexColumn fullWidth fullHeight sx={{ alignItems: "center", justifyContent: "center" }}>
        <ErrorBanner
          report={{
            source: "panel-crash",
            summary: t("skillSurface.loadFailedSummary"),
            errorText: error?.message,
            stackTrace: error instanceof Error ? error.stack : undefined
          }}
        >
          {t("skillSurface.loadFailed")}
        </ErrorBanner>
      </FlexColumn>
    );
  }

  if (mode === "view") {
    return (
      <FlexColumn fullWidth fullHeight sx={{ minHeight: 0, p: SPACING.md }}>
        <Label>{skill.name}</Label>
        {skill.description && (
          <Caption sx={{ color: "text.secondary", mb: SPACING.xs }}>
            {skill.description}
          </Caption>
        )}
        <ScrollArea fullHeight>
          <MarkdownRenderer content={skill.content} fillContainer />
        </ScrollArea>
      </FlexColumn>
    );
  }

  // A shipped skill has no row to write back to, and the tab bar lets anyone
  // flip a tab to Edit — so the pane is opened read-only rather than left to
  // fail its first autosave against the server's refusal.
  return (
    <SkillEditorPane skillId={refId} readOnly={refId.startsWith("system:")} />
  );
};

export default SkillSurface;
