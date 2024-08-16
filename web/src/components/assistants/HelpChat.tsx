import React, { useCallback, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';
import ChatView from './ChatView'; // Assuming ChatView is in the same directory
import { Message, MessageCreateRequest } from '../../stores/ApiTypes';

import { client } from '../../stores/ApiClient';
import { Button } from '@mui/material';

const fetchMessages = async (threadId: string): Promise<Message[]> => {
    const { data, error } = await client.GET('/api/messages/', { params: { query: { thread_id: threadId } } });
    if (error) {
        throw error;
    }
    return data.messages;
};

const sendMessage = async (message: MessageCreateRequest): Promise<Message[]> => {
    const { data, error } = await client.POST('/api/messages/help', { body: message });
    if (error) {
        throw error;
    }
    return data;
};

const HelpChat: React.FC = () => {
    const [showMessages, setShowMessages] = useState(true);
    const [threadId, setThreadId] = useState<string>(uuidv4());
    const queryClient = useQueryClient();
    const { data: messages = [] } = useQuery({
        queryKey: ['chatMessages', threadId],
        queryFn: () => fetchMessages(threadId),
    });

    const mutation = useMutation({
        mutationFn: sendMessage,
        onSuccess: useCallback((newMessages: Message[]) => {
            queryClient.setQueryData(['chatMessages', threadId], messages.concat(newMessages));
        }, [queryClient, messages, threadId]),
    });

    const handleSendMessage = useCallback(async (prompt: string) => {
        const messageRequest: MessageCreateRequest = {
            thread_id: threadId,
            role: 'user',
            content: prompt,
        };
        await mutation.mutateAsync(messageRequest);
    }, [threadId, mutation]);

    return (
        <div className="help-chat">
            <ChatView
                isLoading={mutation.isPending}
                messages={messages}
                showMessages={showMessages}
                setShowMessages={setShowMessages}
                sendMessage={handleSendMessage}
            />
        </div>
    );
};

export default HelpChat;