import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  Caption,
  CodeBlock,
  EditorButton,
  FlexColumn,
  SPACING,
  Text
} from "../ui_primitives";

/**
 * Settings card for the GitHub Copilot provider. The provider uses the
 * machine's own `copilot` CLI, so there is no key to store and nothing for
 * NodeTool to install. The card shows the two commands and re-reads the models.
 */
export default function CopilotCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const refresh = (): Promise<void> =>
    queryClient.invalidateQueries({
      predicate: (query) => {
        const head = query.queryKey[0];
        return (
          typeof head === "string" &&
          (head === "providers" ||
            head.endsWith("-models") ||
            head.endsWith("_models"))
        );
      }
    });

  return (
    <FlexColumn
      component="article"
      aria-label="GitHub Copilot"
      gap={SPACING.lg}
      sx={{ padding: SPACING.xl }}
    >
      <Text>GitHub Copilot</Text>
      <Text>{t("copilot.description")}</Text>
      <Caption>{t("copilot.install")}</Caption>
      <CodeBlock language="shell" copyable>
        npm install -g @github/copilot
      </CodeBlock>
      <CodeBlock language="shell" copyable>
        copilot login
      </CodeBlock>
      <Caption>{t("copilot.signIn")}</Caption>
      <EditorButton
        onClick={() => {
          void refresh();
        }}
      >
        {t("copilot.refreshModels")}
      </EditorButton>
    </FlexColumn>
  );
}
