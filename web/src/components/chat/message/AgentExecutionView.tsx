import React, { memo } from "react";
import type { Message } from "../../../stores/ApiTypes";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import ExecutionTree from "../../execution/ExecutionTree";
import { useExecutionTreeState } from "../../../hooks/useExecutionTreeState";

interface AgentExecutionViewProps {
  messages: Message[];
}

export const AgentExecutionView: React.FC<AgentExecutionViewProps> = ({
  messages
}) => {
  const agentExecutionId = messages?.find(
    (m) => m.agent_execution_id
  )?.agent_execution_id;

  const toolCallsByStep = useGlobalChatStore((state) =>
    agentExecutionId
      ? state.agentExecutionToolCalls[agentExecutionId]
      : undefined
  );

  const { state, toggleExpand } = useExecutionTreeState(
    messages,
    toolCallsByStep
  );

  return (
    <li className="chat-message-list-item execution-event">
      <ExecutionTree state={state} onToggleTask={toggleExpand} />
    </li>
  );
};

export default memo(AgentExecutionView);
