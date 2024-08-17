import React, { useCallback, useEffect } from 'react';
import ChatView from './ChatView';
import { MessageCreateRequest, Workflow } from '../../stores/ApiTypes';
import { useChatStore } from '../../stores/ChatStore';
import { useNodeStore } from '../../stores/NodeStore';
import { Typography } from '@mui/material';

const HelpChat: React.FC = () => {
    const { threadId, messages, isLoading, fetchMessages, sendMessage } = useChatStore();
    const getWorkflow = useNodeStore(state => state.getWorkflow);

    useEffect(() => {
        fetchMessages(threadId);
    }, [threadId, fetchMessages]);

    const handleSendMessage = useCallback(async (prompt: string) => {
        const messageRequest: MessageCreateRequest = {
            thread_id: threadId,
            role: 'user',
            content: prompt,
            workflow: getWorkflow(),
        };
        await sendMessage(messageRequest);
    }, [threadId, sendMessage]);

    return (
        <div className="help-chat">
            <Typography style={{ margin: '1em' }}>
                Welcome to Nodetool! I'm your AI assistant, ready to help you create powerful AI workflows without coding. Ask me anything about Nodetool's features, from building workflows to managing assets. Let's bring your AI ideas to life!
            </Typography>
            <ChatView
                isLoading={isLoading}
                messages={messages}
                sendMessage={handleSendMessage}
            />
        </div>
    );
};

export default HelpChat;