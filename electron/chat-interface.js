// @ts-ignore
const md = new markdownit();

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
 * @property {MessageContent[] | string} content - Content of the message
 * @property {string} workflow_id - ID of the associated workflow
 * @property {string} auth_token - Authentication token
 */
/**
 * Generates a chat interface for workflow interaction
 * @param {HTMLElement} container - The container element to append the chat interface to
 * @param {string} inputKey - The key for the input field
 * @param {(content: MessageContent[]) => Promise<void>} onSubmit - Callback function when a message is submitted
 */
export function generateChatInterface(container, inputKey, onSubmit) {
  const chatContainer = document.querySelector(".chat-view");
  const messagesList = document.querySelector(".messages");
  const textarea = document.querySelector(".chat-input");
  const sendButton = document.querySelector(".chat-send-button");
  const composeMessage = document.querySelector(".compose-message");

  if (
    !chatContainer ||
    !messagesList ||
    !textarea ||
    !sendButton ||
    !composeMessage
  ) {
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
  if (!(composeMessage instanceof HTMLElement)) {
    throw new TypeError("composeMessage must be an HTMLElement");
  }

  let droppedFiles = [];

  // Add drag and drop handlers
  composeMessage.addEventListener("dragover", (e) => {
    e.preventDefault();
    composeMessage.classList.add("dragging");
  });

  composeMessage.addEventListener("dragleave", (e) => {
    e.preventDefault();
    composeMessage.classList.remove("dragging");
  });

  composeMessage.addEventListener("drop", (e) => {
    e.preventDefault();
    composeMessage.classList.remove("dragging");

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      droppedFiles = droppedFiles.concat(files);

      // Create or update preview container
      let previewContainer = document.querySelector(".dropped-files-preview");
      if (!previewContainer) {
        previewContainer = document.createElement("div");
        previewContainer.className = "dropped-files-preview";
        composeMessage.insertBefore(previewContainer, textarea);
      }

      // Add previews for new files
      files.forEach((file) => {
        const preview = document.createElement("div");
        preview.className = "file-preview";

        if (file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUri = reader.result;
            preview.innerHTML = `
              <div class="preview-content">
                <img src="${dataUri}" alt="Preview"/>
                <div class="file-info">
                  <span class="file-name">${file.name}</span>
                  <span class="file-size">${formatFileSize(file.size)}</span>
                </div>
                <button class="remove-file" data-filename="${
                  file.name
                }">×</button>
              </div>
            `;
          };
          reader.readAsDataURL(file);
        } else {
          preview.innerHTML = `
            <div class="preview-content">
              <div class="file-placeholder">
                <svg viewBox="0 0 24 24" width="24" height="24">
                  <path fill="currentColor" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
                </svg>
              </div>
              <div class="file-info">
                <span class="file-name">${file.name}</span>
                <span class="file-size">${formatFileSize(file.size)}</span>
              </div>
              <button class="remove-file" data-filename="${
                file.name
              }">×</button>
            </div>
          `;
        }

        previewContainer.appendChild(preview);
      });

      // Add remove file handlers
      previewContainer.querySelectorAll(".remove-file").forEach((button) => {
        button.addEventListener("click", (e) => {
          /** @type {HTMLButtonElement} */
          // @ts-ignore
          const button = e.currentTarget;
          const filename = button.dataset.filename;
          droppedFiles = droppedFiles.filter((f) => f.name !== filename);
          button.closest(".file-preview").remove();
          if (droppedFiles.length === 0) {
            previewContainer.remove();
          }
        });
      });
    }
  });

  const handleSubmit = () => {
    const message = textarea.value.trim();
    if (message || droppedFiles.length > 0) {
      /**
       * @type {MessageContent[]}
       */
      const messageContents = [];

      if (message) {
        messageContents.push({
          type: "text",
          text: message,
        });
      }

      // Add all dropped files to message contents
      /**
       * @type {MessageContent[]}
       */
      const messageFiles = droppedFiles.map((/* @type {File} */ file) => {
        if (file.type.startsWith("image/")) {
          return {
            type: "image_url",
            image: {
              type: "image",
              uri: "file://" + file.path,
            },
          };
        } else if (file.type.startsWith("audio/")) {
          return {
            type: "audio",
            audio: {
              type: "audio",
              uri: "file://" + file.path,
            },
          };
        } else if (file.type.startsWith("video/")) {
          return {
            type: "video",
            video: {
              type: "video",
              uri: "file://" + file.path,
            },
          };
        }
        return {
          type: "text",
          text: file.name,
        };
      });

      console.log("Message contents:", messageContents);
      console.log("Message files:", messageFiles);

      messageContents.push(...messageFiles);

      appendMessage(messagesList, "user", messageContents);

      textarea.value = "";
      // adjustTextareaHeight(textarea);

      // Send message contents array
      onSubmit(messageContents);

      // Clear all file previews and data
      const previewContainer = document.querySelector(".dropped-files-preview");
      if (previewContainer) {
        previewContainer.remove();
      }
      droppedFiles = [];

      // Disable input while processing
      textarea.disabled = true;
      sendButton.disabled = true;

      // Add loading indicator
      const messageLoading = document.querySelector(".message-loading");
      if (messageLoading instanceof HTMLElement) {
        messageLoading.style.display = "flex";
      }
      const loadingMessage = document.querySelector(".loading-message");
      if (loadingMessage instanceof HTMLElement) {
        loadingMessage.textContent = "";
      }
      const progressBar = document.querySelector(".chat-progress-bar");
      if (progressBar instanceof HTMLElement) {
        progressBar.style.display = "none";
      }
    }
  };

  textarea.addEventListener("input", () => {
    // adjustTextareaHeight(textarea);
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
 * @param {string | MessageContent[]} contents
 */
export function appendMessage(messagesList, role, contents) {
  const message = document.createElement("li");
  message.className = `message ${role}`;

  console.log("Appending message:", contents);

  if (Array.isArray(contents)) {
    for (const content of contents) {
      switch (content.type) {
        case "image_url":
          const imgContainer = document.createElement("div");
          imgContainer.className = "image-message-container";

          const img = document.createElement("img");
          img.src = content.image.uri;
          img.className = "message-image";

          const modal = document.createElement("div");
          modal.className = "image-modal";
          const modalImg = document.createElement("img");
          modalImg.src = content.image.uri;
          modal.appendChild(modalImg);

          imgContainer.appendChild(img);
          imgContainer.appendChild(modal);

          // Add click handlers
          img.addEventListener("click", () => {
            modal.classList.add("active");
          });

          modal.addEventListener("click", () => {
            modal.classList.remove("active");
          });

          message.appendChild(imgContainer);
          break;

        case "audio":
          const audioContainer = document.createElement("div");
          audioContainer.className = "audio-message";
          const audioPlayer = document.createElement("audio");
          audioPlayer.controls = true;
          audioPlayer.src = content.audio.uri;
          audioContainer.appendChild(audioPlayer);
          message.appendChild(audioContainer);
          break;

        case "video":
          const videoContainer = document.createElement("div");
          videoContainer.className = "video-message";
          const videoPlayer = document.createElement("video");
          videoPlayer.controls = true;
          videoPlayer.src = content.video.uri;
          videoContainer.appendChild(videoPlayer);
          message.appendChild(videoContainer);
          break;

        case "text":
          const markdownContent = document.createElement("div");
          markdownContent.className = "markdown-content";
          markdownContent.innerHTML = md.render(content.text);
          message.appendChild(markdownContent);
          break;

        default:
          message.textContent = JSON.stringify(content);
      }
    }
  } else if (typeof contents === "string") {
    const markdownContent = document.createElement("div");
    markdownContent.className = "markdown-content";
    markdownContent.innerHTML = md.render(contents);
    message.appendChild(markdownContent);
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
  const messagesList = document.querySelector(".messages");
  if (!(messagesList instanceof HTMLUListElement)) {
    throw new Error("Messages list not found");
  }
  appendMessage(messagesList, "assistant", message.content);

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
  const loadingMessage = document.querySelector(".message-loading");
  if (loadingMessage instanceof HTMLElement) {
    loadingMessage.style.display = "none";
  }
}

// Helper function to format file size
// @param {number} bytes - The file size in bytes
// @returns {string} - The formatted file size
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
