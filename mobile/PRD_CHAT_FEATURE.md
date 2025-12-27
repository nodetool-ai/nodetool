# Product Requirements Document: Mobile Chat Feature

## Overview

This document defines the requirements for implementing a Chat screen in the NodeTool mobile app (React Native). The implementation ports the existing web chat functionality while adapting it to React Native best practices.

## Executive Summary

The mobile chat feature enables users to interact with AI assistants through a conversational interface. The feature uses WebSocket-based real-time communication to send and receive messages, supporting markdown rendering for rich content display.

---

## 1. Feature Analysis - Existing Web Chat Capabilities

### 1.1 Core Messaging Features
| Feature | Description | Web Implementation |
|---------|-------------|-------------------|
| Message Display | Render user and assistant messages | `MessageView.tsx`, `ChatThreadView.tsx` |
| Markdown Rendering | Rich text formatting for messages | `ChatMarkdown.tsx` with `react-markdown` |
| Text Input | Multiline input for composing messages | `MessageInput.tsx` with `TextareaAutosize` |
| Send Message | Submit messages via Enter key or button | `ChatComposer.tsx`, `SendMessageButton.tsx` |
| Stop Generation | Halt ongoing AI response | `StopGenerationButton.tsx` |
| New Chat | Create new conversation thread | `NewChatButton.tsx` |
| Loading Animation | Pulsating dots during AI response | `LoadingIndicator.tsx` with CSS animations |

### 1.2 Thread Management Features
| Feature | Description | Web Implementation |
|---------|-------------|-------------------|
| Thread List | Display all conversation threads | `ThreadList.tsx` |
| Thread Selection | Switch between threads | `switchThread()` in `GlobalChatStore.ts` |
| Thread Creation | Create new conversation threads | `createNewThread()` in `GlobalChatStore.ts` |
| Thread Deletion | Remove conversation threads | `deleteThread()` in `GlobalChatStore.ts` |
| Thread Title | Auto-generate titles from first message | Store logic |

### 1.3 WebSocket Communication
| Feature | Description | Web Implementation |
|---------|-------------|-------------------|
| Connection Management | Connect/disconnect/reconnect | `WebSocketManager.ts` |
| Message Encoding | Msgpack binary encoding | `@msgpack/msgpack` |
| Auto-reconnect | Exponential backoff reconnection | `WebSocketManager.ts` |
| Message Queueing | Queue messages during reconnection | `WebSocketManager.ts` |
| Protocol Handling | Handle various message types | `chatProtocol.ts` |

### 1.4 Advanced Messaging Features
| Feature | Description | Web Implementation |
|---------|-------------|-------------------|
| File Attachments | Upload/attach files to messages | `FilePreview.tsx`, `useFileHandling.ts` |
| Image Display | Render images in messages | `MessageContentRenderer.tsx` |
| Video Display | Render videos in messages | `MessageContentRenderer.tsx` |
| Audio Display | Render audio in messages | `MessageContentRenderer.tsx` |
| Drag and Drop | Drop files into chat | `useDragAndDrop.ts` |

### 1.5 Tool Integration
| Feature | Description | Web Implementation |
|---------|-------------|-------------------|
| Tool Selection | Choose which tools to enable | `ChatToolBar.tsx` |
| Tool Call Display | Show tool execution progress | `ToolCallCard` in `MessageView.tsx` |
| Tool Results | Display results from tool calls | `toolResultsByCallId` |
| Collections Selection | Choose knowledge collections | `CollectionsSelector.tsx` |

### 1.6 Agent Mode Features
| Feature | Description | Web Implementation |
|---------|-------------|-------------------|
| Agent Mode Toggle | Enable/disable agent behavior | `agentMode` in store |
| Planning Updates | Display agent planning | `PlanningUpdateDisplay.tsx` |
| Task Updates | Display task execution | `TaskUpdateDisplay.tsx` |
| Step Results | Display step outcomes | `StepResultDisplay.tsx` |
| Agent Execution View | Consolidated agent output | `AgentExecutionView.tsx` |

### 1.7 Model Selection
| Feature | Description | Web Implementation |
|---------|-------------|-------------------|
| Model Picker | Select AI model | `ChatToolBar.tsx` |
| Provider Selection | Filter by provider | `ModelFiltersStore.ts` |
| Model Persistence | Remember selected model | Zustand persist |

### 1.8 UI/UX Features
| Feature | Description | Web Implementation |
|---------|-------------|-------------------|
| Auto-scroll | Scroll to bottom on new messages | `ChatThreadView.tsx` |
| Scroll to Bottom Button | Manual scroll to bottom | `ScrollToBottomButton.tsx` |
| Thought Expansion | Expand/collapse thinking sections | `ThoughtSection.tsx` |
| Code Highlighting | Syntax highlighting in code blocks | `CodeBlock.tsx` |
| Copy to Clipboard | Copy message content | `CopyToClipboardButton` |
| Connection Status | Display connection state | Alert in `GlobalChat.tsx` |

---

## 2. Scope Definition

### 2.1 Features IN SCOPE for This PR (MVP)

The following features will be implemented in this PR to deliver a functional chat experience:

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 1 | Message Display (User/Assistant) | Critical | Core functionality |
| 2 | Markdown Rendering | Critical | For readable responses |
| 3 | Chat Composer (Input Field) | Critical | User input mechanism |
| 4 | Send Button | Critical | Message submission |
| 5 | New Chat Button | Critical | Thread management |
| 6 | WebSocket Communication | Critical | Real-time messaging |
| 7 | Pulsating Loading Animation | High | UX feedback |
| 8 | Connection Status Display | High | User awareness |
| 9 | Auto-scroll | Medium | UX convenience |

### 2.2 Technical Constraints for This PR

- **No input files**: File attachments are deferred
- **No tools**: Tool selection/execution is deferred  
- **No agent mode**: Agent features are deferred
- **Single thread**: No thread list/switching in MVP

### 2.3 Features DEFERRED to Future PRs

#### Future PR 1: Thread Management
- Thread list view
- Thread switching
- Thread deletion
- Thread title display/editing
- Thread history persistence

#### Future PR 2: Model Selection
- Model picker UI
- Provider filtering
- Model persistence

#### Future PR 3: File Attachments
- File upload UI
- Image preview
- Media playback in messages
- File type detection

#### Future PR 4: Tool Integration
- Tool selector
- Tool call display
- Tool result rendering
- Collections picker

#### Future PR 5: Agent Mode
- Agent mode toggle
- Planning display
- Task progress
- Step results view
- Agent execution consolidation

#### Future PR 6: Advanced UX
- Scroll to bottom button
- Thought section expansion
- Code syntax highlighting
- Copy functionality
- Keyboard shortcuts

---

## 3. Technical Specifications

### 3.1 Architecture Overview

```
mobile/
├── src/
│   ├── screens/
│   │   └── ChatScreen.tsx           # Main chat screen
│   ├── components/
│   │   └── chat/
│   │       ├── ChatView.tsx         # Main chat container
│   │       ├── ChatComposer.tsx     # Input + send button
│   │       ├── ChatMessageList.tsx  # Message list container
│   │       ├── MessageView.tsx      # Individual message
│   │       ├── ChatMarkdown.tsx     # Markdown renderer
│   │       ├── LoadingIndicator.tsx # Pulsating animation
│   │       └── NewChatButton.tsx    # New chat action
│   ├── stores/
│   │   └── ChatStore.ts             # Zustand state management
│   ├── services/
│   │   └── WebSocketManager.ts      # WebSocket abstraction
│   └── types/
│       └── chat.ts                  # Chat-specific types
```

### 3.2 State Management

The ChatStore (Zustand) will manage:
- `status`: Connection state (disconnected/connecting/connected/loading/streaming/error)
- `messages`: Array of Message objects for current thread
- `currentThreadId`: Active thread identifier
- `error`: Error message if any
- `statusMessage`: Status/progress message

### 3.3 WebSocket Protocol

Messages are encoded with msgpack and follow this structure:

**Outbound (User Message):**
```typescript
{
  type: "message",
  role: "user",
  content: [{ type: "text", text: string }],
  thread_id: string,
  provider?: string,
  model?: string
}
```

**Inbound (Message Types):**
- `message`: Complete message from assistant
- `chunk`: Streaming text chunk
- `job_update`: Job status changes
- `generation_stopped`: Stop confirmation

### 3.4 Component Specifications

#### ChatView
- Container component managing layout
- Handles message list and composer positioning
- Manages keyboard avoidance on mobile

#### MessageView
- Renders individual messages
- Differentiates user vs assistant styling
- Integrates markdown rendering

#### ChatMarkdown
- Uses `react-native-markdown-display`
- Supports GFM tables and code blocks
- Custom styling for dark theme

#### ChatComposer
- TextInput for message composition
- Send button (enabled when connected + has content)
- Disabled state during loading/streaming

#### LoadingIndicator
- Pulsating circle animation
- Shown during loading/streaming states

---

## 4. User Experience Specifications

### 4.1 Screen Layout

```
┌─────────────────────────────┐
│         Header Bar          │
│  [←]    Chat    [New Chat]  │
├─────────────────────────────┤
│                             │
│     Message List Area       │
│                             │
│  ┌───────────────────────┐  │
│  │ User: Hello           │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │ Assistant: Hi there!  │  │
│  │ How can I help?       │  │
│  └───────────────────────┘  │
│                             │
│         [●]                 │  ← Loading indicator
│                             │
├─────────────────────────────┤
│ ┌─────────────────────┐ [↑] │
│ │ Type a message...   │     │
│ └─────────────────────┘     │
└─────────────────────────────┘
```

### 4.2 Interaction States

1. **Disconnected**: Input disabled, show reconnecting message
2. **Connected**: Input enabled, ready to send
3. **Loading**: Input enabled, show loading indicator
4. **Streaming**: Input enabled, show animated response
5. **Error**: Show error alert, allow retry

### 4.3 Visual Design

- Dark theme consistent with app design
- User messages: Right-aligned, accent color background
- Assistant messages: Left-aligned, subtle background
- Loading indicator: Centered, animated dots/pulse
- Send button: Blue/accent when active, gray when disabled

---

## 5. Acceptance Criteria

### 5.1 Functional Requirements

- [ ] User can type messages in the input field
- [ ] User can send messages by tapping send button
- [ ] User messages appear in the chat immediately
- [ ] Assistant responses stream and display correctly
- [ ] Markdown content renders properly (bold, italic, code, links)
- [ ] Loading indicator appears while waiting for response
- [ ] New chat button creates a new conversation
- [ ] Chat auto-scrolls to show new messages

### 5.2 Technical Requirements

- [ ] WebSocket connects on screen mount
- [ ] WebSocket reconnects automatically on disconnect
- [ ] Messages are encoded/decoded with msgpack
- [ ] State persists during background/foreground transitions
- [ ] Input field handles multiline text
- [ ] Keyboard avoidance works on both iOS and Android

### 5.3 Performance Requirements

- [ ] Message list renders efficiently (virtualized if needed)
- [ ] Smooth scrolling with many messages
- [ ] No lag during text input
- [ ] Animations run at 60fps

---

## 6. Dependencies

### 6.1 Existing Dependencies (Already in package.json)
- `@msgpack/msgpack`: Binary message encoding
- `react-native-markdown-display`: Markdown rendering
- `zustand`: State management
- `@react-navigation/native`: Navigation

### 6.2 No New Dependencies Required

The implementation will use existing dependencies.

---

## 7. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| WebSocket compatibility | High | Use React Native compatible patterns |
| Markdown rendering issues | Medium | Test with various content |
| Performance with many messages | Medium | Implement virtualization if needed |
| Keyboard handling differences | Low | Platform-specific adjustments |

---

## 8. Success Metrics

1. **Functionality**: All acceptance criteria pass
2. **Stability**: No crashes during normal use
3. **Performance**: Smooth 60fps animations
4. **Compatibility**: Works on iOS and Android

---

## 9. Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-XX | GitHub Copilot | Initial PRD |

---

## Appendix A: Web vs Mobile Adaptations

| Web Pattern | Mobile Adaptation |
|-------------|-------------------|
| `@emotion/react` CSS | React Native StyleSheet |
| `TextareaAutosize` | TextInput with multiline |
| `react-markdown` | `react-native-markdown-display` |
| CSS keyframes | Animated API or Reanimated |
| useMediaQuery | Platform.OS / Dimensions |
| window.visualViewport | KeyboardAvoidingView |
| document.addEventListener | AppState listener |

## Appendix B: Message Types Reference

```typescript
interface Message {
  id?: string;
  type: "message";
  role: "user" | "assistant" | "system" | "tool" | "agent_execution";
  content: string | MessageContent[];
  thread_id?: string;
  created_at?: string;
  tool_calls?: ToolCall[];
  agent_execution_id?: string;
  execution_event_type?: string;
}

interface MessageContent {
  type: "text" | "image_url" | "audio" | "video" | "document";
  text?: string;
  image?: { uri: string };
  audio?: { uri: string };
  video?: { uri: string };
}

interface Chunk {
  type: "chunk";
  content: string;
  done: boolean;
}
```
