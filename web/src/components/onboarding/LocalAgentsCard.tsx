/**
 * Home card that connects the coding agents installed on this machine to
 * NodeTool: Claude Code, Codex and Antigravity.
 *
 * It appears when at least one of them is installed and not yet connected.
 * One click writes the NodeTool MCP entry into each agent's own config, the
 * same entry `nodetool mcp install` writes. The agent then reaches NodeTool
 * through `execute_code` and the `nodetool.*` object model. The card stays
 * after the write to say what to do next: restart the agent and ask it
 * something, with a prompt to copy.
 *
 * Hidden on a hosted server, where the status procedure refuses, and for good
 * once the person closes it.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import TerminalOutlinedIcon from "@mui/icons-material/TerminalOutlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";

import useOnboardingStore from "../../stores/OnboardingStore";
import ErrorBanner from "../support/ErrorBanner";
import {
  BORDER_RADIUS,
  Caption,
  Chip,
  CloseButton,
  CopyButton,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  PADDING,
  Text
} from "../ui_primitives";
import { useLocalAgents, type LocalAgent } from "./useLocalAgents";

/** "Claude Code and Codex", in the interface language. */
const joinLabels = (agents: readonly LocalAgent[], language: string): string =>
  new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(
    agents.map((agent) => agent.label)
  );

const LocalAgentsCard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const dismissed = useOnboardingStore((s) => s.localAgentsDismissed);
  const dismiss = useOnboardingStore((s) => s.dismissLocalAgents);
  const { agents, connect, connecting } = useLocalAgents();
  // The agents this card just connected. Keeps the next steps on screen after
  // the refreshed status reports every agent connected.
  const [justConnected, setJustConnected] = useState<LocalAgent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = useMemo(
    () => agents.filter((agent) => !agent.connected),
    [agents]
  );

  const handleConnect = useCallback(async () => {
    setError(null);
    try {
      setJustConnected(await connect(pending.map((agent) => agent.target)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [connect, pending]);

  if (dismissed || (justConnected === null && pending.length === 0)) {
    return null;
  }

  const prompt = t("localAgents.examplePrompt");

  return (
    <FlexRow
      component="section"
      aria-label={t("localAgents.ariaLabel")}
      align="flex-start"
      gap={GAP.comfortable}
      sx={{
        width: "100%",
        p: PADDING.comfortable,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: BORDER_RADIUS.lg,
        bgcolor: "background.paper"
      }}
    >
      <TerminalOutlinedIcon color="primary" aria-hidden />
      <FlexColumn gap={GAP.compact} sx={{ flex: 1, minWidth: 0 }}>
        {justConnected === null ? (
          <>
            <FlexColumn gap={GAP.micro}>
              <Text component="h2" size="big" weight={500}>
                {t("localAgents.heading", {
                  agents: joinLabels(agents, i18n.language)
                })}
              </Text>
              <Caption color="secondary">{t("localAgents.description")}</Caption>
            </FlexColumn>
            <FlexRow gap={GAP.compact} wrap>
              {agents.map((agent) => (
                <Chip
                  key={agent.target}
                  compact
                  label={
                    agent.connected
                      ? t("localAgents.agentConnected", { agent: agent.label })
                      : agent.label
                  }
                  color={agent.connected ? "success" : "default"}
                  icon={agent.connected ? <CheckCircleIcon /> : undefined}
                />
              ))}
            </FlexRow>
            {error !== null && (
              <ErrorBanner
                compact
                report={{
                  source: "operation-failure",
                  summary: t("localAgents.connectFailed"),
                  errorText: error
                }}
                onRetry={() => void handleConnect()}
              >
                {t("localAgents.connectFailed")}
              </ErrorBanner>
            )}
            <FlexRow gap={GAP.compact}>
              <EditorButton
                variant="contained"
                disabled={connecting}
                onClick={() => void handleConnect()}
              >
                {connecting
                  ? t("localAgents.connecting")
                  : t("localAgents.connect", {
                      agents: joinLabels(pending, i18n.language)
                    })}
              </EditorButton>
            </FlexRow>
          </>
        ) : (
          <>
            <FlexColumn gap={GAP.micro}>
              <Text component="h2" size="big" weight={500}>
                {t("localAgents.connectedHeading", {
                  agents: joinLabels(justConnected, i18n.language)
                })}
              </Text>
              <Caption color="secondary">
                {t("localAgents.nextStep", {
                  agents: joinLabels(justConnected, i18n.language)
                })}
              </Caption>
            </FlexColumn>
            <FlexRow align="center" gap={GAP.compact}>
              <Text component="q" sx={{ flex: 1, minWidth: 0 }}>
                {prompt}
              </Text>
              <CopyButton value={prompt} tooltip={t("localAgents.copyPrompt")} />
            </FlexRow>
            <FlexRow gap={GAP.compact}>
              <EditorButton variant="outlined" onClick={dismiss}>
                {t("localAgents.done")}
              </EditorButton>
            </FlexRow>
          </>
        )}
      </FlexColumn>
      <CloseButton onClick={dismiss} tooltip={t("localAgents.dismiss")} />
    </FlexRow>
  );
};

export default memo(LocalAgentsCard);
