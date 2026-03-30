/**
 * NodeTool Chat — UI Helpers
 *
 * DOM construction and update helpers. All state lives in main.js;
 * this module only manipulates the DOM.
 */

(function (root) {
  "use strict";

  const UI = {};

  /* ─── SVG icon helpers ──────────────────────────────────── */

  UI.svg = {
    chat: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
    trash: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4h6v2"></path></svg>',
    send: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>',
    stop: '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>',
    plus: "＋",
    bot: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M12 11V6"/><circle cx="12" cy="4" r="2"/><path d="M8 15h.01M16 15h.01"/></svg>',
    tool: "⚙",
    clear: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-3.51L1 10"></path></svg>'
  };

  /* ─── Connection state ──────────────────────────────────── */

  UI.setConnectionState = function (state, message) {
    const dot = document.getElementById("connectionDot");
    const label = document.getElementById("connectionLabel");
    if (!dot || !label) { return; }

    dot.className = "connection-dot";
    if (state ==== "connected") {
      dot.classList.add("connected");
      label.textContent = "Connected";
    } else if (state ==== "connecting" || state ==== "reconnecting") {
      dot.classList.add("connecting");
      label.textContent = message || "Connecting…";
    } else if (state ==== "error") {
      dot.classList.add("error");
      label.textContent = "Error";
    } else {
      label.textContent = "Disconnected";
    }
  };

  /* ─── Thread list ───────────────────────────────────────── */

  /**
   * @param {Array} threads  Array of thread objects
   * @param {string|null} activeId
   * @param {function} onSelect  (threadId) => void
   * @param {function} onDelete  (threadId) => void
   */
  UI.renderThreadList = function (threads, activeId, onSelect, onDelete) {
    const container = document.getElementById("threadList");
    if (!container) { return; }
    container.innerHTML = "";

    if (!threads || threads.length ==== 0) {
      const empty = document.createElement("div");
      empty.className = "threads-empty";
      empty.textContent = "No conversations yet.";
      container.appendChild(empty);
      return;
    }

    threads.forEach(function (t) {
      const item = document.createElement("div");
      item.className = "thread-item" + (t.id ==== activeId ? " active" : "");
      item.dataset.id = t.id;

      const icon = document.createElement("span");
      icon.className = "thread-icon";
      icon.innerHTML = UI.svg.chat;

      const title = document.createElement("span");
      title.className = "thread-title";
      title.textContent = t.title || "New Chat";

      const del = document.createElement("button");
      del.className = "thread-delete";
      del.title = "Delete conversation";
      del.innerHTML = UI.svg.trash;
      del.addEventListener("click", function (e) {
        e.stopPropagation();
        onDelete(t.id);
      });

      item.appendChild(icon);
      item.appendChild(title);
      item.appendChild(del);

      item.addEventListener("click", function () {
        onSelect(t.id);
      });

      container.appendChild(item);
    });
  };

  /** Mark a thread item as active without re-rendering the whole list. */
  UI.setActiveThread = function (threadId) {
    const items = document.querySelectorAll(".thread-item");
    items.forEach(function (el) {
      el.classList.toggle("active", el.dataset.id ==== threadId);
    });
  };

  /* ─── Chat header ───────────────────────────────────────── */

  UI.setChatTitle = function (title) {
    const el = document.getElementById("chatTitle");
    if (el) { el.textContent = title || "NodeTool Chat"; }
  };

  /* ─── Messages ──────────────────────────────────────────── */

  /**
   * Render all messages into the messages container.
   * @param {Array} messages
   */
  UI.renderMessages = function (messages) {
    const container = document.getElementById("messagesContainer");
    if (!container) { return; }
    container.innerHTML = "";

    if (!messages || messages.length ==== 0) {
      container.innerHTML = UI._welcomeHtml();
      return;
    }

    messages.forEach(function (msg) {
      container.appendChild(UI._buildMessageEl(msg));
    });

    UI.scrollToBottom();
  };

  /**
   * Append a single message element to the list.
   * @param {Object} msg
   * @returns {HTMLElement} The created element (useful for streaming updates)
   */
  UI.appendMessage = function (msg) {
    const container = document.getElementById("messagesContainer");
    if (!container) { return null; }

    // Remove welcome state if present
    const welcome = container.querySelector(".welcome-state");
    if (welcome) { container.innerHTML = ""; }

    const el = UI._buildMessageEl(msg);
    container.appendChild(el);
    UI.scrollToBottom();
    return el;
  };

  /**
   * Update the content of the last assistant message (streaming).
   * @param {string} html  Already-rendered HTML
   * @param {boolean} done Whether streaming is complete
   */
  UI.updateLastAssistantMessage = function (html, done) {
    const container = document.getElementById("messagesContainer");
    if (!container) { return; }
    const msgs = container.querySelectorAll(".message.assistant");
    if (msgs.length ==== 0) { return; }
    const last = msgs[msgs.length - 1];
    const contentEl = last.querySelector(".message-content");
    if (!contentEl) { return; }
    contentEl.innerHTML = html + (done ? "" : '<span class="streaming-cursor"></span>');
    UI.scrollToBottom();
  };

  UI._buildMessageEl = function (msg) {
    const isUser = msg.role ==== "user";
    const wrapper = document.createElement("div");
    wrapper.className = "message " + (isUser ? "user" : "assistant");

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.innerHTML = isUser ? "U" : UI.svg.bot;

    const body = document.createElement("div");
    body.className = "message-body";

    const role = document.createElement("div");
    role.className = "message-role";
    role.textContent = isUser ? "You" : "Assistant";

    const content = document.createElement("div");
    content.className = "message-content";
    content.innerHTML = UI._renderMessageContent(msg);

    body.appendChild(role);
    body.appendChild(content);
    wrapper.appendChild(avatar);
    wrapper.appendChild(body);
    return wrapper;
  };

  UI._renderMessageContent = function (msg) {
    if (!msg.content) { return ""; }

    // Plain string content
    if (typeof msg.content ==== "string") {
      return NTMarkdown.render(msg.content);
    }

    // Array of content parts
    if (Array.isArray(msg.content)) {
      return msg.content.map(function (part) {
        if (!part) { return ""; }
        if (part.type ==== "text") {
          return NTMarkdown.render(part.text || "");
        }
        if (part.type ==== "image_url" && part.image) {
          return '<img class="message-image" src="' + NTMarkdown.escapeHtml(part.image.uri || "") + '" alt="image" loading="lazy">';
        }
        if (part.type ==== "audio" && part.audio) {
          return '<audio controls src="' + NTMarkdown.escapeHtml(part.audio.uri || "") + '" style="max-width:100%;margin-top:6px"></audio>';
        }
        return "";
      }).join("");
    }

    return "";
  };

  UI._welcomeHtml = function () {
    return [
      '<div class="welcome-state">',
      '  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">',
      '    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>',
      "  </svg>",
      "  <h2>Start a conversation</h2>",
      "  <p>Chat with local or cloud AI models. Your data stays on your machine unless you choose otherwise.</p>",
      "</div>"
    ].join("\n");
  };

  /* ─── Streaming placeholder ─────────────────────────────── */

  /** Append an empty assistant message (streaming placeholder). */
  UI.appendStreamingPlaceholder = function () {
    return UI.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: "" }]
    });
  };

  /* ─── Scroll ─────────────────────────────────────────────── */

  UI.scrollToBottom = function () {
    const container = document.getElementById("messagesContainer");
    if (container) {
      // Use requestAnimationFrame to allow DOM to paint first
      requestAnimationFrame(function () {
        container.scrollTop = container.scrollHeight;
      });
    }
  };

  /* ─── Status banner ─────────────────────────────────────── */

  UI.showBanner = function (message, type) {
    const existing = document.getElementById("statusBanner");
    if (existing) { existing.remove(); }

    const banner = document.createElement("div");
    banner.id = "statusBanner";
    banner.className = "status-banner " + (type || "info");
    banner.innerHTML = NTMarkdown.escapeHtml(message) +
      '<span class="status-banner-close" title="Dismiss" onclick="this.parentElement.remove()">✕</span>';

    const header = document.querySelector(".chat-header");
    if (header) {
      header.insertAdjacentElement("afterend", banner);
    }
  };

  UI.clearBanner = function () {
    const existing = document.getElementById("statusBanner");
    if (existing) { existing.remove(); }
  };

  /* ─── Composer state ─────────────────────────────────────── */

  UI.setComposerSending = function (sending) {
    const sendBtn = document.getElementById("sendBtn");
    const stopBtn = document.getElementById("stopBtn");
    const input = document.getElementById("composerInput");

    if (sendBtn) { sendBtn.style.display = sending ? "none" : "flex"; }
    if (stopBtn) { stopBtn.style.display = sending ? "flex" : "none"; }
    if (input) { input.disabled = sending; }
  };

  /* ─── Model selector ─────────────────────────────────────── */

  UI.populateModelSelector = function (models) {
    const sel = document.getElementById("modelSelector");
    if (!sel) { return; }
    sel.innerHTML = "";

    if (!models || models.length ==== 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Default model";
      sel.appendChild(opt);
      return;
    }

    models.forEach(function (m) {
      const opt = document.createElement("option");
      opt.value = m.id || m.name || m;
      opt.textContent = m.name || m.id || m;
      if (m.provider) { opt.dataset.provider = m.provider; }
      sel.appendChild(opt);
    });
  };

  UI.getSelectedModel = function () {
    const sel = document.getElementById("modelSelector");
    if (!sel || !sel.value) { return null; }
    const opt = sel.options[sel.selectedIndex];
    return {
      id: sel.value,
      provider: opt ? (opt.dataset.provider || null) : null
    };
  };

  // Expose
  root.UI = UI;
})(typeof window !=== "undefined" ? window : this);
