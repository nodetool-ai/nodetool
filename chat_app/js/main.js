/**
 * NodeTool Chat — Application State & Orchestration
 *
 * Ties together ChatClient, UI helpers, and Markdown renderer.
 * No framework dependencies — pure browser JS.
 */

(function () {
  "use strict";

  /* ─── State ─────────────────────────────────────────────── */

  var state = {
    threads: [],          // Array<{id, title, updated_at}>
    activeThreadId: null,
    messageCache: {},     // threadId → Array<message>
    streamingText: "",    // accumulated streaming text for active thread
    isStreaming: false,
    connectionState: "disconnected"
  };

  var client = new ChatClient({
    apiUrl: "http://localhost:7777",
    wsUrl: "ws://localhost:7777/ws"
  });

  /* ─── Bootstrap ─────────────────────────────────────────── */

  function init() {
    // Warn if running from file:// (CORS issues with null origin)
    if (window.location.protocol === "file:") {
      UI.showBanner(
        "Running from file:// may cause CORS errors. Please serve via HTTP: python3 -m http.server 8080",
        "error"
      );
    }

    // Wire up WebSocket handlers
    client.onConnectionChange = handleConnectionChange;
    client.onMessage = handleWsMessage;

    // Wire up UI events
    var composerInput = document.getElementById("composerInput");
    var sendBtn = document.getElementById("sendBtn");
    var stopBtn = document.getElementById("stopBtn");
    var newChatBtn = document.getElementById("newChatBtn");

    if (composerInput) {
      composerInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          submitMessage();
        }
      });
      // Auto-resize textarea
      composerInput.addEventListener("input", autoResizeTextarea);
    }
    if (sendBtn) { sendBtn.addEventListener("click", submitMessage); }
    if (stopBtn) {
      stopBtn.addEventListener("click", function () {
        if (state.activeThreadId) {
          client.stopGeneration(state.activeThreadId);
        }
      });
    }
    if (newChatBtn) { newChatBtn.addEventListener("click", createNewThread); }

    // Connect WebSocket & load data
    client.connect();
    loadModels();
    loadThreads();
  }

  /* ─── Connection ─────────────────────────────────────────── */

  function handleConnectionChange(connState, message) {
    state.connectionState = connState;
    UI.setConnectionState(connState, message);

    if (connState === "error") {
      UI.showBanner(
        message || "Cannot connect to NodeTool backend. Make sure it is running on localhost:7777.",
        "error"
      );
    } else if (connState === "connected") {
      UI.clearBanner();
    }
  }

  /* ─── WebSocket message handling ───────────────────────────── */

  function handleWsMessage(data) {
    if (!data || !data.type) { return; }

    var threadId = data.thread_id || null;

    switch (data.type) {
      // ── Full message (user echo or assistant final) ──
      case "message":
        if (!threadId) { break; }
        handleFullMessage(threadId, data);
        break;

      // ── Streaming text chunk ──
      case "chunk":
        if (!threadId) { break; }
        handleChunk(threadId, data);
        break;

      // ── Tool calls ──
      case "tool_call":
        if (!threadId) { break; }
        appendToolCallIndicator(threadId, data);
        break;

      // ── Planning / task updates (agent mode) ──
      case "planning_update":
      case "task_update":
        // Optionally display status
        break;

      // ── Generation stopped ──
      case "generation_stopped":
        finalizeStreaming(threadId || state.activeThreadId);
        break;

      // ── Thread summary updated ──
      case "thread_update":
        if (data.title && threadId) {
          updateThreadTitle(threadId, data.title);
        }
        break;

      default:
        break;
    }
  }

  function handleFullMessage(threadId, data) {
    // If this is the assistant's final message after streaming, finalize streaming first
    if (state.isStreaming && data.role === "assistant" && threadId === state.activeThreadId) {
      finalizeStreaming(threadId);
    }

    // Add to cache if not already present (avoid duplicating optimistic user message)
    var existing = (state.messageCache[threadId] || []);
    var alreadyThere = existing.some(function (m) {
      return m.id && m.id === data.id;
    });
    if (!alreadyThere && data.role !== "user") {
      // For user messages the optimistic add already happened; skip duplicates
      addMessageToCache(threadId, data);
    }

    if (threadId === state.activeThreadId) {
      UI.renderMessages(state.messageCache[threadId]);
    }
  }

  function handleChunk(threadId, data) {
    if (threadId !== state.activeThreadId) { return; }

    if (data.thinking) {
      // Thinking/reasoning chunk — skip or show separately
      return;
    }

    state.streamingText += (data.content || "");
    state.isStreaming = !data.done;

    var html = NTMarkdown.render(state.streamingText);
    UI.updateLastAssistantMessage(html, data.done);

    if (data.done) {
      finalizeStreaming(threadId);
    }
  }

  function appendToolCallIndicator(threadId, data) {
    if (threadId !== state.activeThreadId) { return; }
    var container = document.getElementById("messagesContainer");
    if (!container) { return; }
    var card = document.createElement("div");
    card.className = "tool-call-card";
    card.innerHTML = '<span class="tool-icon">' + UI.svg.tool + '</span>' +
      '<span>Calling tool: </span><span class="tool-name">' +
      NTMarkdown.escapeHtml(data.name || "") + '</span>';
    container.appendChild(card);
    UI.scrollToBottom();
  }

  function finalizeStreaming(threadId) {
    if (!state.isStreaming) { return; }
    state.isStreaming = false;
    UI.setComposerSending(false);

    // Persist the streamed message to cache if we got chunks but no final message
    if (state.streamingText && threadId && threadId === state.activeThreadId) {
      var msgs = state.messageCache[threadId] || [];
      var last = msgs[msgs.length - 1];
      if (!last || last.role !== "assistant" || !last._fromStream) {
        var streamMsg = {
          role: "assistant",
          _fromStream: true,
          content: [{ type: "text", text: state.streamingText }],
          created_at: new Date().toISOString()
        };
        addMessageToCache(threadId, streamMsg);
      } else {
        last.content = [{ type: "text", text: state.streamingText }];
      }
    }
    state.streamingText = "";
    // Re-render without cursor
    UI.renderMessages(state.messageCache[threadId || state.activeThreadId] || []);
  }

  /* ─── Message cache ─────────────────────────────────────── */

  function addMessageToCache(threadId, msg) {
    if (!state.messageCache[threadId]) {
      state.messageCache[threadId] = [];
    }
    state.messageCache[threadId].push(msg);
  }

  /* ─── Thread management ─────────────────────────────────── */

  function loadThreads() {
    client.listThreads()
      .then(function (data) {
        // API returns {threads: [...]} or a plain array
        var list = Array.isArray(data) ? data : (data.threads || []);
        // Sort by updated_at descending
        list.sort(function (a, b) {
          return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
        });
        state.threads = list;
        UI.renderThreadList(state.threads, state.activeThreadId, selectThread, deleteThread);

        if (list.length > 0 && !state.activeThreadId) {
          selectThread(list[0].id);
        }
      })
      .catch(function (err) {
        console.error("[Chat] Failed to load threads:", err);
      });
  }

  function selectThread(threadId) {
    if (state.activeThreadId === threadId) { return; }

    // Finalize any in-progress stream on the old thread
    if (state.isStreaming) { finalizeStreaming(state.activeThreadId); }

    state.activeThreadId = threadId;
    state.streamingText = "";
    state.isStreaming = false;

    UI.setActiveThread(threadId);
    UI.setComposerSending(false);

    var thread = state.threads.find(function (t) { return t.id === threadId; });
    UI.setChatTitle(thread ? (thread.title || "New Chat") : "New Chat");

    // Load messages if not cached
    if (state.messageCache[threadId]) {
      UI.renderMessages(state.messageCache[threadId]);
      return;
    }

    UI.renderMessages(null); // show loading / empty
    client.fetchMessages(threadId, 100)
      .then(function (data) {
        var messages = Array.isArray(data) ? data : (data.messages || []);
        messages.sort(function (a, b) {
          return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        });
        state.messageCache[threadId] = messages;
        if (state.activeThreadId === threadId) {
          UI.renderMessages(messages);
        }
      })
      .catch(function (err) {
        console.error("[Chat] Failed to load messages:", err);
      });
  }

  function createNewThread() {
    client.createThread("New Chat")
      .then(function (thread) {
        state.threads.unshift(thread);
        state.messageCache[thread.id] = [];
        UI.renderThreadList(state.threads, thread.id, selectThread, deleteThread);
        selectThread(thread.id);

        // Focus the composer
        var input = document.getElementById("composerInput");
        if (input) { input.focus(); }
      })
      .catch(function (err) {
        console.error("[Chat] Failed to create thread:", err);
        UI.showBanner("Failed to create new conversation: " + err.message, "error");
      });
  }

  function deleteThread(threadId) {
    if (!confirm("Delete this conversation?")) { return; }

    client.deleteThread(threadId)
      .then(function () {
        state.threads = state.threads.filter(function (t) { return t.id !== threadId; });
        delete state.messageCache[threadId];

        if (state.activeThreadId === threadId) {
          state.activeThreadId = null;
          UI.setChatTitle("NodeTool Chat");
          UI.renderMessages(null);
        }

        UI.renderThreadList(state.threads, state.activeThreadId, selectThread, deleteThread);

        if (!state.activeThreadId && state.threads.length > 0) {
          selectThread(state.threads[0].id);
        }
      })
      .catch(function (err) {
        console.error("[Chat] Failed to delete thread:", err);
      });
  }

  function updateThreadTitle(threadId, title) {
    var thread = state.threads.find(function (t) { return t.id === threadId; });
    if (thread) {
      thread.title = title;
      UI.renderThreadList(state.threads, state.activeThreadId, selectThread, deleteThread);
      if (threadId === state.activeThreadId) {
        UI.setChatTitle(title);
      }
    }
  }

  /* ─── Sending messages ───────────────────────────────────── */

  function submitMessage() {
    var input = document.getElementById("composerInput");
    if (!input) { return; }
    var text = input.value.trim();
    if (!text) { return; }
    if (state.isStreaming) { return; }

    // Ensure we have a thread
    if (!state.activeThreadId) {
      createNewThread();
      // Retry after thread is created — simplest approach: store pending text
      _pendingMessage = text;
      input.value = "";
      resetTextareaHeight(input);
      return;
    }

    sendMessage(state.activeThreadId, text);
    input.value = "";
    resetTextareaHeight(input);
  }

  var _pendingMessage = null;

  function sendMessage(threadId, text) {
    if (!text) { return; }

    // Optimistically add user message to UI
    var userMsg = {
      role: "user",
      content: [{ type: "text", text: text }],
      created_at: new Date().toISOString()
    };
    addMessageToCache(threadId, userMsg);
    UI.renderMessages(state.messageCache[threadId]);

    // Append a streaming placeholder for the assistant
    UI.appendStreamingPlaceholder();
    state.isStreaming = true;
    state.streamingText = "";
    UI.setComposerSending(true);

    var model = UI.getSelectedModel();
    try {
      client.sendChatMessage(threadId, text, {
        model: model ? model.id : null,
        provider: model ? model.provider : null
      });
    } catch (err) {
      console.error("[Chat] Failed to send message:", err);
      UI.showBanner("Failed to send message: " + err.message, "error");
      state.isStreaming = false;
      UI.setComposerSending(false);
    }
  }

  /* ─── Models ─────────────────────────────────────────────── */

  function loadModels() {
    client.listModels()
      .then(function (data) {
        var models = Array.isArray(data) ? data : (data.models || []);
        UI.populateModelSelector(models);
      })
      .catch(function () { /* ignore — model selector will show default */ });
  }

  /* ─── Textarea utils ─────────────────────────────────────── */

  function autoResizeTextarea() {
    this.style.height = "auto";
    var max = 180;
    this.style.height = Math.min(this.scrollHeight, max) + "px";
  }

  function resetTextareaHeight(el) {
    el.style.height = "auto";
  }

  /* ─── Handle pending message after thread creation ─────── */
  var _origCreateNewThread = createNewThread;
  function createNewThreadWithPending() {
    client.createThread("New Chat")
      .then(function (thread) {
        state.threads.unshift(thread);
        state.messageCache[thread.id] = [];
        UI.renderThreadList(state.threads, thread.id, selectThread, deleteThread);
        selectThread(thread.id);

        var input = document.getElementById("composerInput");
        if (input) { input.focus(); }

        if (_pendingMessage) {
          var msg = _pendingMessage;
          _pendingMessage = null;
          sendMessage(thread.id, msg);
        }
      })
      .catch(function (err) {
        _pendingMessage = null;
        console.error("[Chat] Failed to create thread:", err);
        UI.showBanner("Failed to create new conversation: " + err.message, "error");
      });
  }

  // Override createNewThread
  createNewThread = createNewThreadWithPending;

  /* ─── DOMContentLoaded ───────────────────────────────────── */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
