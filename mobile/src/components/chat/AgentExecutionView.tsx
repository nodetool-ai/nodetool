/**
 * AgentExecutionView — React Native port of
 * web/src/components/chat/message/AgentExecutionView.tsx.
 *
 * Groups all agent_execution messages for a single execution id, runs them
 * through the execution-tree reducer, and renders the tree.
 */

import React, { memo } from 'react';
import type { Message } from '../../types/ApiTypes';
import { useChatStore } from '../../stores/ChatStore';
import { useExecutionTreeState } from '../../hooks/useExecutionTreeState';
import { ExecutionTree } from './ExecutionTree';

interface AgentExecutionViewProps {
  messages: Message[];
}

export const AgentExecutionView: React.FC<AgentExecutionViewProps> = ({
  messages,
}) => {
  const agentExecutionId = messages?.find(
    (m) => (m as Message & { agent_execution_id?: string | null }).agent_execution_id
  )?.agent_execution_id as string | undefined;

  const toolCallsByStep = useChatStore((state) =>
    agentExecutionId ? state.agentExecutionToolCalls[agentExecutionId] : undefined
  );

  const { state, toggleExpand } = useExecutionTreeState(messages, toolCallsByStep);

  return <ExecutionTree state={state} onToggleTask={toggleExpand} />;
};

export default memo(AgentExecutionView);
