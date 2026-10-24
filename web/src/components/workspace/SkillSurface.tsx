import { useSkill } from "../../hooks/skills/useSkills";
import { useTranslation } from "react-i18next";
import type {
  WorkspaceTab,
  WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import SkillEditorPane from "../skills/SkillEditorPane";
import ErrorBanner from "../support/ErrorBanner";
import {
  Caption,
  FlexColumn,
  LoadingSpinner,
  ScrollArea,
  SPACING
} from "../ui_primitives";
import MarkdownRenderer from "../../utils/MarkdownRenderer";
import { WithDocumentBar, workspaceDocumentBar } from "./documentBarParts";

interface SkillSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  active: boolean;
  /** The workspace tab, whose document bar tops the surface. */
  tab: WorkspaceTab;
}

/**
 * The surface of a skill tab. View mode reads the skill as Markdown under
 * its description. Edit mode is the skill editor, which draws the bar with
 * its autosave status.
 */
const SkillSurface = ({ refId, mode, tab }: SkillSurfaceProps) => {
  const { t } = useTranslation("translation", { keyPrefix: "i18n-next106" });
  const { data: skill, isLoading, error } = useSkill(refId);

  if (isLoading) {
    return (
      <WithDocumentBar tab={tab}>
        <FlexColumn
          fullWidth
          fullHeight
          sx={{ alignItems: "center", justifyContent: "center" }}
        >
          <LoadingSpinner />
        </FlexColumn>
      </WithDocumentBar>
    );
  }
  if (error || !skill) {
    return (
      <WithDocumentBar tab={tab}>
        <FlexColumn
          fullWidth
          fullHeight
          sx={{ alignItems: "center", justifyContent: "center" }}
        >
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
      </WithDocumentBar>
    );
  }

  if (mode === "view") {
    return (
      <WithDocumentBar tab={tab}>
        <FlexColumn fullWidth fullHeight sx={{ minHeight: 0, p: SPACING.md }}>
          {skill.description && (
            <Caption sx={{ color: "text.secondary", mb: SPACING.xs }}>
              {skill.description}
            </Caption>
          )}
          <ScrollArea fullHeight>
            <MarkdownRenderer content={skill.content} fillContainer />
          </ScrollArea>
        </FlexColumn>
      </WithDocumentBar>
    );
  }

  // A shipped skill has no row to write back to, and the document bar lets
  // anyone flip a tab to Edit — so the pane is opened read-only rather than left to
  // fail its first autosave against the server's refusal.
  return (
    <SkillEditorPane
      skillId={refId}
      readOnly={refId.startsWith("system:")}
      documentBar={workspaceDocumentBar(tab)}
    />
  );
};

export default SkillSurface;
