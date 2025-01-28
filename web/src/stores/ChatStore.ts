import { create } from "zustand";
import { Message } from "./ApiTypes";
import { ToolCall } from "./ApiTypes";
import { tutorials, useTutorialStore } from "./TutorialStore";
import { BASE_URL } from "./ApiClient";

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

    const assistantMessage = {
      role: "assistant",
      content: "",
      type: "assistant",
      name: "assistant"
    };
    get().addMessages([assistantMessage]);

    try {
      const response = await fetch(BASE_URL + "/api/messages/help", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages,
          available_tutorials: Object.keys(tutorials)
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Response body is null");

      while (true) {
        const result = await reader.read();
        if (result.done) break;
        const chunk = new TextDecoder().decode(result.value);

        // Update the last assistant message with the new chunk
        set((state) => {
          const updatedMessages = [...state.messages];
          const lastMessage = updatedMessages[updatedMessages.length - 1];
          lastMessage.content += chunk;
          return { messages: updatedMessages };
        });
      }

      const data = await response.json();

      // Handle tool calls
      data.forEach((response: Message) => {
        if (response.tool_calls) {
          response.tool_calls.forEach((toolCall: ToolCall) => {
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
