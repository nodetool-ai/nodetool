import { act } from "@testing-library/react";
import { useVibeCodingStore } from "../VibeCodingStore";
import { Message } from "../ApiTypes";

describe("VibeCodingStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useVibeCodingStore.setState({ sessions: {} });
  });

  describe("initial state", () => {
    it("has empty sessions record", () => {
      const { sessions } = useVibeCodingStore.getState();
      expect(sessions).toEqual({});
    });
  });

  describe("getSession", () => {
    it("returns default session for unknown workflow", () => {
      const session = useVibeCodingStore.getState().getSession("unknown");
      expect(session).toEqual({
        workflowId: "unknown",
        messages: [],
        currentHtml: null,
        savedHtml: null,
        status: "idle",
        error: null
      });
    });

    it("returns existing session", () => {
      useVibeCodingStore.setState({
        sessions: {
          workflow1: {
            workflowId: "workflow1",
            messages: [],
            currentHtml: "<html></html>",
            savedHtml: null,
            status: "idle",
            error: null
          }
        }
      });

      const session = useVibeCodingStore.getState().getSession("workflow1");
      expect(session.currentHtml).toBe("<html></html>");
    });
  });

  describe("initSession", () => {
    it("initializes session with saved html", () => {
      act(() => {
        useVibeCodingStore.getState().initSession("workflow1", "<html>saved</html>");
      });

      const session = useVibeCodingStore.getState().getSession("workflow1");
      expect(session.savedHtml).toBe("<html>saved</html>");
      expect(session.currentHtml).toBe("<html>saved</html>");
    });

    it("initializes session with null html", () => {
      act(() => {
        useVibeCodingStore.getState().initSession("workflow1", null);
      });

      const session = useVibeCodingStore.getState().getSession("workflow1");
      expect(session.savedHtml).toBeNull();
      expect(session.currentHtml).toBeNull();
    });
  });

  describe("clearSession", () => {
    it("removes session", () => {
      useVibeCodingStore.setState({
        sessions: {
          workflow1: {
            workflowId: "workflow1",
            messages: [],
            currentHtml: null,
            savedHtml: null,
            status: "idle",
            error: null
          }
        }
      });

      act(() => {
        useVibeCodingStore.getState().clearSession("workflow1");
      });

      const { sessions } = useVibeCodingStore.getState();
      expect(sessions["workflow1"]).toBeUndefined();
    });
  });

  describe("addMessage", () => {
    it("adds a message to session", () => {
      const message: Message = {
        type: "message",
        role: "user",
        name: "",
        content: [{ type: "text", text: "Hello" }],
        created_at: new Date().toISOString()
      };

      act(() => {
        useVibeCodingStore.getState().addMessage("workflow1", message);
      });

      const session = useVibeCodingStore.getState().getSession("workflow1");
      expect(session.messages).toHaveLength(1);
      expect(session.messages[0]).toEqual(message);
    });

    it("appends messages in order", () => {
      const message1: Message = {
        type: "message",
        role: "user",
        name: "",
        content: [{ type: "text", text: "First" }],
        created_at: new Date().toISOString()
      };
      const message2: Message = {
        type: "message",
        role: "assistant",
        name: "",
        content: [{ type: "text", text: "Second" }],
        created_at: new Date().toISOString()
      };

      act(() => {
        useVibeCodingStore.getState().addMessage("workflow1", message1);
        useVibeCodingStore.getState().addMessage("workflow1", message2);
      });

      const session = useVibeCodingStore.getState().getSession("workflow1");
      expect(session.messages).toHaveLength(2);
    });
  });

  describe("updateLastMessage", () => {
    it("updates the last message content", () => {
      const message: Message = {
        type: "message",
        role: "assistant",
        name: "",
        content: [{ type: "text", text: "Initial" }],
        created_at: new Date().toISOString()
      };

      act(() => {
        useVibeCodingStore.getState().addMessage("workflow1", message);
        useVibeCodingStore.getState().updateLastMessage("workflow1", "Updated");
      });

      const session = useVibeCodingStore.getState().getSession("workflow1");
      const lastMessage = session.messages[0];
      if (Array.isArray(lastMessage.content)) {
        expect(lastMessage.content[0]).toEqual({ type: "text", text: "Updated" });
      } else {
        fail("Expected content to be an array");
      }
    });

    it("does nothing if no messages exist", () => {
      act(() => {
        useVibeCodingStore.getState().updateLastMessage("workflow1", "Test");
      });

      const session = useVibeCodingStore.getState().getSession("workflow1");
      expect(session.messages).toHaveLength(0);
    });
  });

  describe("clearMessages", () => {
    it("clears all messages", () => {
      const message: Message = {
        type: "message",
        role: "user",
        name: "",
        content: [{ type: "text", text: "Test" }],
        created_at: new Date().toISOString()
      };

      act(() => {
        useVibeCodingStore.getState().addMessage("workflow1", message);
        useVibeCodingStore.getState().clearMessages("workflow1");
      });

      const session = useVibeCodingStore.getState().getSession("workflow1");
      expect(session.messages).toHaveLength(0);
    });
  });

  describe("setCurrentHtml", () => {
    it("sets current html", () => {
      act(() => {
        useVibeCodingStore.getState().setCurrentHtml("workflow1", "<html>new</html>");
      });

      const session = useVibeCodingStore.getState().getSession("workflow1");
      expect(session.currentHtml).toBe("<html>new</html>");
    });

    it("can set html to null", () => {
      act(() => {
        useVibeCodingStore.getState().setCurrentHtml("workflow1", "<html>test</html>");
        useVibeCodingStore.getState().setCurrentHtml("workflow1", null);
      });

      const session = useVibeCodingStore.getState().getSession("workflow1");
      expect(session.currentHtml).toBeNull();
    });
  });

  describe("setSavedHtml", () => {
    it("sets saved html and updates current html", () => {
      act(() => {
        useVibeCodingStore.getState().setCurrentHtml("workflow1", "<html>unsaved</html>");
        useVibeCodingStore.getState().setSavedHtml("workflow1", "<html>saved</html>");
      });

      const session = useVibeCodingStore.getState().getSession("workflow1");
      expect(session.savedHtml).toBe("<html>saved</html>");
      expect(session.currentHtml).toBe("<html>saved</html>");
    });
  });

  describe("setStatus", () => {
    it("sets status", () => {
      act(() => {
        useVibeCodingStore.getState().setStatus("workflow1", "streaming");
      });

      const session = useVibeCodingStore.getState().getSession("workflow1");
      expect(session.status).toBe("streaming");
    });
  });

  describe("setError", () => {
    it("sets error and updates status to error", () => {
      act(() => {
        useVibeCodingStore.getState().setError("workflow1", "Something went wrong");
      });

      const session = useVibeCodingStore.getState().getSession("workflow1");
      expect(session.error).toBe("Something went wrong");
      expect(session.status).toBe("error");
    });

    it("clears error when set to null", () => {
      act(() => {
        useVibeCodingStore.getState().setError("workflow1", "Error");
        useVibeCodingStore.getState().setStatus("workflow1", "complete");
        useVibeCodingStore.getState().setError("workflow1", null);
      });

      const session = useVibeCodingStore.getState().getSession("workflow1");
      expect(session.error).toBeNull();
      expect(session.status).toBe("complete");
    });
  });

  describe("isDirty", () => {
    it("returns false when no session exists", () => {
      const isDirty = useVibeCodingStore.getState().isDirty("unknown");
      expect(isDirty).toBe(false);
    });

    it("returns false when current matches saved", () => {
      act(() => {
        useVibeCodingStore.getState().initSession("workflow1", "<html>same</html>");
      });

      const isDirty = useVibeCodingStore.getState().isDirty("workflow1");
      expect(isDirty).toBe(false);
    });

    it("returns true when current differs from saved", () => {
      act(() => {
        useVibeCodingStore.getState().initSession("workflow1", "<html>saved</html>");
        useVibeCodingStore.getState().setCurrentHtml("workflow1", "<html>modified</html>");
      });

      const isDirty = useVibeCodingStore.getState().isDirty("workflow1");
      expect(isDirty).toBe(true);
    });

    it("returns true when current is set and saved is null", () => {
      act(() => {
        useVibeCodingStore.getState().initSession("workflow1", null);
        useVibeCodingStore.getState().setCurrentHtml("workflow1", "<html>new</html>");
      });

      const isDirty = useVibeCodingStore.getState().isDirty("workflow1");
      expect(isDirty).toBe(true);
    });
  });

  describe("workflow isolation", () => {
    it("maintains separate state for different workflows", () => {
      act(() => {
        useVibeCodingStore.getState().initSession("workflow1", "<html>1</html>");
        useVibeCodingStore.getState().initSession("workflow2", "<html>2</html>");
        useVibeCodingStore.getState().setStatus("workflow1", "streaming");
        useVibeCodingStore.getState().setStatus("workflow2", "complete");
      });

      const session1 = useVibeCodingStore.getState().getSession("workflow1");
      const session2 = useVibeCodingStore.getState().getSession("workflow2");

      expect(session1.savedHtml).toBe("<html>1</html>");
      expect(session2.savedHtml).toBe("<html>2</html>");
      expect(session1.status).toBe("streaming");
      expect(session2.status).toBe("complete");
    });
  });
});
