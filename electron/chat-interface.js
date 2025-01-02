/**
 * @typedef {Object} MessageTextContent
 * @property {'text'} type - Type of message content
 * @property {string} text - The text content
 */

/**
 * @typedef {Object} MessageImageContent
 * @property {'image_url'} type - Type of message content
 * @property {Object} image - The image reference
 */

/**
 * @typedef {Object} MessageAudioContent
 * @property {'audio'} type - Type of message content
 * @property {Object} audio - The audio reference
 */

/**
 * @typedef {Object} MessageVideoContent
 * @property {'video'} type - Type of message content
 * @property {Object} video - The video reference
 */

/** @typedef {MessageTextContent | MessageImageContent | MessageAudioContent | MessageVideoContent} MessageContent */

/**
 * @typedef {Object} ChatMessage
 * @property {string} type - Message type
 * @property {string} role - Role of the message sender (user/assistant)
 * @property {MessageContent | string} content - Content of the message
 * @property {string} workflow_id - ID of the associated workflow
 * @property {string} auth_token - Authentication token
 */
/**
 * Generates a chat interface for workflow interaction
 * @param {HTMLElement} container - The container element to append the chat interface to
 * @param {string} inputKey - The key for the input field
 * @param {(message: string) => Promise<void>} onSubmit - Callback function when a message is submitted
 */
export function generateChatInterface(container, inputKey, onSubmit) {
  const chatContainer = document.querySelector(".chat-view");
  const messagesList = document.querySelector(".messages");
  const textarea = document.querySelector(".chat-input");
  const sendButton = document.querySelector(".chat-send-button");

  if (!chatContainer || !messagesList || !textarea || !sendButton) {
    throw new Error("Required chat elements not found");
  }

  // Type assertions
  if (!(chatContainer instanceof HTMLElement)) {
    throw new TypeError("chatContainer must be an HTMLElement");
  }
  if (!(messagesList instanceof HTMLUListElement)) {
    throw new TypeError("messagesList must be an HTMLUListElement");
  }
  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new TypeError("textarea must be an HTMLTextAreaElement");
  }
  if (!(sendButton instanceof HTMLButtonElement)) {
    throw new TypeError("sendButton must be an HTMLButtonElement");
  }

  const handleSubmit = () => {
    const message = textarea.value.trim();
    if (message) {
      appendMessage(messagesList, "user", message);
      textarea.value = "";
      adjustTextareaHeight(textarea);
      onSubmit(message);

      // Disable input while processing
      textarea.disabled = true;
      sendButton.disabled = true;

      // Add loading indicator
      appendLoadingMessage(messagesList);
    }
  };

  textarea.addEventListener("input", () => {
    adjustTextareaHeight(textarea);
  });

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  });

  sendButton.addEventListener("click", handleSubmit);
}

/**
 * Appends a loading message to the chat
 * @param {HTMLUListElement} messagesList
 */
function appendLoadingMessage(messagesList) {
  const loadingMessage = document.createElement("li");
  loadingMessage.className = "message system loading";
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.className = "dot";
    loadingMessage.appendChild(dot);
  }
  loadingMessage.textContent = "Loading...";
  const progressBar = document.createElement("div");
  progressBar.className = "chat-progress-bar";
  loadingMessage.appendChild(progressBar);
  const progressFill = document.createElement("div");
  progressFill.className = "chat-progress-fill";
  progressBar.appendChild(progressFill);
  messagesList.appendChild(loadingMessage);
}

/**
 * Adjusts the height of a textarea based on its content
 * @param {HTMLTextAreaElement} textarea
 */
function adjustTextareaHeight(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = textarea.scrollHeight + "px";
}

/**
 * Appends a new message to the chat interface
 * @param {HTMLUListElement} messagesList
 * @param {'user' | 'assistant' | 'system'} role
 * @param {string | MessageContent} content
 */
export function appendMessage(messagesList, role, content) {
  const message = document.createElement("li");
  message.className = `message ${role}`;

  if (typeof content === "object" && content.type === "image_url") {
    const img = document.createElement("img");
    const blob = new Blob([content.image.data], { type: "image/png" });
    img.src = URL.createObjectURL(blob);
    img.onload = () => URL.revokeObjectURL(img.src);
    message.appendChild(img);
  } else if (typeof content === "object" && content.type === "text") {
    message.textContent = content.text;
  } else if (typeof content === "string") {
    message.textContent = content;
  }

  messagesList.appendChild(message);
  message.scrollIntoView({ behavior: "smooth" });
}

/**
 * Handles a chat message
 * @param {ChatMessage} message
 */
export function handleChatMessage(message) {
  console.log("Chat message received:", message);
  // Remove any loading message
  const loadingMessage = document.querySelector(".message.system.loading");
  if (loadingMessage) {
    loadingMessage.remove();
  }
  const messagesList = document.querySelector(".messages");
  if (!(messagesList instanceof HTMLUListElement)) {
    throw new Error("Messages list not found");
  }
  if (message.role === "assistant") {
    if (typeof message.content === "string") {
      appendMessage(messagesList, "assistant", message.content);
    } else if (Array.isArray(message.content)) {
      for (const item of message.content) {
        appendMessage(messagesList, "assistant", item);
      }
    } else {
      appendMessage(messagesList, "assistant", JSON.stringify(message.content));
    }
    // Re-enable after a short delay or when response is received
    const textarea = document.querySelector(".chat-input");
    const sendButton = document.querySelector(".chat-send-button");
    if (
      textarea instanceof HTMLTextAreaElement &&
      sendButton instanceof HTMLButtonElement
    ) {
      textarea.disabled = false;
      sendButton.disabled = false;
      textarea.focus();
    }
    // hide loading indicator
    const loaderContainer = document.querySelector(".loader-container");
    if (loaderContainer instanceof HTMLElement) {
      loaderContainer.style.display = "none";
    }
  }
}
