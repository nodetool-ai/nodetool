import React, { useCallback, useEffect } from 'react';
import ChatView from './ChatView';
import { MessageCreateRequest, Workflow } from '../../stores/ApiTypes';
import { useChatStore } from '../../stores/ChatStore';

const HelpChat: React.FC = () => {
    const { threadId, messages, isLoading, fetchMessages, sendMessage } = useChatStore();

    useEffect(() => {
        fetchMessages(threadId);
    }, [threadId, fetchMessages]);

    const handleSendMessage = useCallback(async (prompt: string) => {
        const messageRequest: MessageCreateRequest = {
            thread_id: threadId,
            role: 'user',
            content: prompt,
        };
        await sendMessage(messageRequest);
    }, [threadId, sendMessage]);

    return (
        <div className="help-chat">
            <ChatView
                isLoading={isLoading}
                messages={messages}
                sendMessage={handleSendMessage}
            />
        </div>
    );
};

export default HelpChat;