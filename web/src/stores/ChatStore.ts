import { create } from "zustand";
import { Message } from "./ApiTypes";
import { ToolCall } from "./ApiTypes";
import { tutorials, useTutorialStore } from "./TutorialStore";

interface ChatStore {
  messages: Message[];
  isLoading: boolean;
  setMessages: (messages: Message[]) => void;
  addMessages: (messages: Message[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  sendMessage: (message: Message) => Promise<void>;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  isLoading: false,
  setMessages: (messages) => set({ messages }),
  addMessages: (newMessages) =>
    set((state) => ({ messages: [...state.messages, ...newMessages] })),
  setIsLoading: (isLoading) => set({ isLoading }),
  sendMessage: async (message: Message) => {
    set({ isLoading: true });
    const messages = get().messages.concat(message);
    get().addMessages([message]);
    try {
      const response = await fetch(
        // "http://dev.nodetool.ai:8000/api/messages/help",
        "https://api.nodetool.ai/api/messages/help",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messages,
            available_tutorials: Object.keys(tutorials)
          })
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      get().addMessages(
        data.filter(
          (msg: Message) =>
            msg.tool_calls === undefined ||
            msg.tool_calls === null ||
            msg.tool_calls.length === 0
        )
      );

      // Check for workflow tool calls
      data.forEach((response: Message) => {
        console.log("response", response);
        if (response.tool_calls) {
          response.tool_calls.forEach((toolCall: ToolCall) => {
            // if (toolCall.name === 'workflow_tool') {
            //     get().handleWorkflowTool(toolCall.result as Workflow);
            // }
            if (toolCall.name === "start_tutorial") {
              const result = toolCall.result as { [key: string]: any };
              useTutorialStore
                .getState()
                .startTutorial(result["tutorial_name"]);
            }
          });
        }
      });
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      set({ isLoading: false });
    }
  }
}));
