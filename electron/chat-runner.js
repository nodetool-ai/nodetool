/**
 * @typedef {Object} Message
 * @property {string} type - Message type
 * @property {string} role - Message role
 * @property {string} content - Message content
 * @property {string} [workflow_id] - ID of the workflow
 * @property {Object} [graph] - Workflow graph data
 * @property {string} [auth_token] - Authentication token
 */

/**
 * Chat WebSocket runner for browser environments
 */
class ChatRunner {
  constructor(config = {}) {
    this.CHAT_URL = config.chatUrl || "ws://127.0.0.1:8000/chat";
    this.socket = null;
    this.status = "disconnected";
    this.messages = [];
    this.progress = 0;
    this.total = 0;
    this.error = null;
    this.workflowId = null;

    // Callbacks
    this.onMessageCallback = null;
    this.onStatusChangeCallback = null;
    this.onProgressCallback = null;
    this.onErrorCallback = null;
    this.onNodeUpdateCallback = null;
    this.onJobUpdateCallback = null;
  }

  /**
   * Connect to the chat WebSocket
   * @param {string} workflowId - Workflow ID to connect to
   * @returns {Promise<void>}
   */
  async connect(workflowId) {
    if (this.socket) {
      this.disconnect();
    }

    this.workflowId = workflowId;
    this._setStatus("connecting");

    this.socket = new WebSocket(this.CHAT_URL);

    this.socket.onopen = () => {
      console.log("Chat WebSocket connected");
      this._setStatus("connected");
    };

    this.socket.onmessage = async (event) => {
      const arrayBuffer = await event.data.arrayBuffer();
      // @ts-ignore - assuming msgpack is globally available
      const data = msgpack.decode(new Uint8Array(arrayBuffer));

      if (data.type === "message") {
        this.messages.push(data);
        this._setStatus("connected");
        this._setProgress(0, 0);
        this.onMessageCallback?.(data);
      } else {
        // Handle other update types
        this._handleUpdate(data);
      }
    };

    this.socket.onerror = (error) => {
      console.error("Chat WebSocket error:", error);
      this._setError("WebSocket connection error");
    };

    this.socket.onclose = () => {
      console.log("Chat WebSocket disconnected");
      this._setStatus("disconnected");
    };

    // Wait for connection
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (this.socket?.readyState === WebSocket.OPEN) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }

  /**
   * Disconnect from the WebSocket
   */
  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  /**
   * Send a message through the WebSocket
   * @param {Message} message - Message to send
   */
  async sendMessage(message) {
    this.messages.push(message);
    this._setStatus("loading");

    // @ts-ignore - assuming msgpack is globally available
    this.socket?.send(msgpack.encode(message));
  }

  /**
   * Reset message history
   */
  resetMessages() {
    this.messages = [];
  }

  /**
   * Set callback for new messages
   * @param {Function} callback
   */
  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  /**
   * Set callback for status changes
   * @param {Function} callback
   */
  onStatusChange(callback) {
    this.onStatusChangeCallback = callback;
  }

  /**
   * Set callback for progress updates
   * @param {Function} callback
   */
  onProgress(callback) {
    this.onProgressCallback = callback;
  }

  /**
   * Set callback for errors
   * @param {Function} callback
   */
  onError(callback) {
    this.onErrorCallback = callback;
  }

  /**
   * Set callback for node updates
   * @param {Function} callback
   */
  onNodeUpdate(callback) {
    this.onNodeUpdateCallback = callback;
  }

  /**
   * Set callback for job updates
   * @param {Function} callback
   */
  onJobUpdate(callback) {
    this.onJobUpdateCallback = callback;
  }

  // Private methods
  _setStatus(status) {
    this.status = status;
    this.onStatusChangeCallback?.(status);
  }

  _setProgress(progress, total) {
    this.progress = progress;
    this.total = total;
    this.onProgressCallback?.(progress, total);
  }

  _setError(error) {
    this.error = error;
    this.onErrorCallback?.(error);
  }

  _handleUpdate(data) {
    if (data.type === "job_update") {
      this.onJobUpdateCallback?.(data);
      if (data.status === "completed") {
        this._setProgress(0, 0);
        this._setStatus("connected");
        this.onStatusChangeCallback?.("connected");
      } else if (data.status === "failed") {
        this._setError(data.error);
        this._setStatus("error");
        this._setProgress(0, 0);
        this.onStatusChangeCallback?.("error");
      }
    } else if (data.type === "node_update") {
      this.onNodeUpdateCallback?.(data);
      if (data.status === "completed") {
        this._setProgress(0, 0);
      }
    } else if (data.type === "node_progress") {
      this._setProgress(data.progress, data.total);
      this.onProgressCallback?.(data.progress, data.total);
    }
  }
}

// Usage example:
/*
const chatRunner = new ChatRunner({
  chatUrl: "ws://your-websocket-url"
});

chatRunner.onMessage((message) => {
  console.log("New message:", message);
});

chatRunner.onStatusChange((status) => {
  console.log("Status changed:", status);
});

chatRunner.onProgress((progress, total) => {
  console.log(`Progress: ${progress}/${total}`);
});

chatRunner.onError((error) => {
  console.error("Error:", error);
});

// Send a message
chatRunner.sendMessage({
  type: "message",
  workflow_id: "123",
  content: "Hello"
});
*/

export default ChatRunner;
