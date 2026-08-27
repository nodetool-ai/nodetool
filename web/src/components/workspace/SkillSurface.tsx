import { useSkill } from "../../hooks/skills/useSkills";
import type { WorkspaceTabMode } from "../../stores/WorkspaceTabsStore";
import SkillEditorPane from "../skills/SkillEditorPane";
import ReportBugButton from "../support/ReportBugButton";
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
        <Caption sx={{ color: "error.main" }}>Failed to load skill</Caption>
        <ReportBugButton
          context={{
            source: "panel-crash",
            summary: "Skill surface failed to load",
            errorText: error?.message,
            stackTrace: error instanceof Error ? error.stack : undefined
          }}
        />
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

  return <SkillEditorPane skillId={refId} />;
};

export default SkillSurface;
