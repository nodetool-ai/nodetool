import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { Message, MessageCreateRequest, Workflow } from './ApiTypes';
import { client } from './ApiClient';
import { useNodeStore } from './NodeStore';
import { Node } from 'reactflow';
import { NodeData } from './NodeData';
import useMetadataStore from './MetadataStore';
import { ToolCall } from './ApiTypes';

interface ChatStore {
    messages: Message[];
    isLoading: boolean;
    setMessages: (messages: Message[]) => void;
    addMessages: (messages: Message[]) => void;
    setIsLoading: (isLoading: boolean) => void;
    sendMessage: (message: Message) => Promise<void>;
    handleWorkflowTool: (workflow: Workflow) => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
    messages: [],
    isLoading: false,
    setMessages: (messages) => set({ messages }),
    addMessages: (newMessages) => set((state) => ({ messages: [...state.messages, ...newMessages] })),
    setIsLoading: (isLoading) => set({ isLoading }),
    sendMessage: async (message: Message) => {
        set({ isLoading: true });
        const messages = get().messages.concat(message);
        get().addMessages([message]);
        try {
            const { data, error } = await client.POST('/api/messages/help', { body: { messages } });
            if (error) {
                throw error;
            }
            get().addMessages(data);

            // Check for workflow tool calls
            data.forEach((response: Message) => {
                if (response.role === 'tool' && response.tool_calls) {
                    response.tool_calls.forEach((toolCall: ToolCall) => {
                        if (toolCall.name === 'workflow_tool') {
                            get().handleWorkflowTool(toolCall.result as Workflow);
                        }
                        if (toolCall.name?.startsWith('add_node')) {
                            const metadata = useMetadataStore.getState().metadata
                            if (!data) {
                                console.error('Metadata not loaded');
                                return;
                            }
                            if (toolCall.result) {
                                const result = toolCall.result as { [key: string]: any };
                                const nodeMetadata = metadata[result["type"]];
                                if (!nodeMetadata) {
                                    console.error('Node metadata not found for type:', result["type"]);
                                    return;
                                }
                                const node = useNodeStore.getState().createNode(nodeMetadata, { x: 0, y: 0 }, toolCall.result as Node<NodeData>);
                                useNodeStore.getState().addNode(node);
                            }
                        }
                    });
                }
            });
        } catch (error) {
            console.error('Error sending message:', error);
        } finally {
            set({ isLoading: false });
        }
    },
    handleWorkflowTool: (workflow: Workflow) => {
        console.log('Workflow tool called with:', workflow);
        workflow.id = uuidv4();
        useNodeStore.getState().setShouldAutoLayout(true);
        useNodeStore.getState().setWorkflow(workflow);
    },
}));