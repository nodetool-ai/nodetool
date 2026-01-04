# Product Requirements Document:  Nodetool Chrome Extension

**Version:** 1.0  
**Date:** January 2, 2026  
**Author:** @georgi  
**Status:** Draft

---

## 1. Executive Summary

The Nodetool Chrome Extension brings AI-powered workflow automation directly into the browser through a Chrome Side Panel interface. Users can interact with their local or remote Nodetool server to run workflows, chat with AI models, and leverage Nodetool's visual AI capabilities without leaving their browser context.

### Key Value Propositions
- **Contextual AI Assistance:** Access Nodetool's AI capabilities from any webpage
- **Seamless Integration:** Connect to local or self-hosted Nodetool servers
- **Persistent Chat Interface:** Side panel stays available across all tabs
- **Workflow Automation:** Trigger workflows directly from browser context

---

## 2. Product Overview

### 2.1 Vision
Enable users to leverage Nodetool's visual AI workflow capabilities directly within their browser, providing contextual AI assistance, workflow execution, and real-time interaction with the Nodetool server ecosystem.

### 2.2 Target Users
- **Nodetool Desktop Users:** Users running Nodetool locally who want browser integration
- **Self-Hosted Users:** Teams with private Nodetool deployments accessing via VPN
- **Power Users:** Users automating repetitive browser tasks with AI workflows
- **Content Creators:** Users generating media or processing documents while browsing

### 2.3 Use Cases
1. **Contextual Chat:** Ask questions about webpage content using Nodetool's AI models
2. **Workflow Execution:** Trigger pre-built workflows from browser context
3. **Document Processing:** Process downloaded documents through Nodetool RAG systems
4. **Media Generation:** Generate images/videos based on browser content
5. **Agent Mode:** Enable autonomous task completion within browser context

---

## 3. Technical Architecture

### 3.1 Extension Structure

```
nodetool-chrome-extension/
├── manifest. json                 # Chrome Extension V3 manifest
├── src/
│   ├── background/
│   │   ├── service-worker.ts    # Background service worker
│   │   ├── server-connection.ts  # WebSocket/API manager
│   │   └── auth-handler.ts       # Authentication logic
│   ├── sidepanel/
│   │   ├── index.html            # Side panel UI entry
│   │   ├── app.tsx               # React main component
│   │   ├── components/
│   │   │   ├── ChatInterface.tsx
│   │   │   ├── WorkflowList.tsx
│   │   │   ├── ServerStatus.tsx
│   │   │   └── Settings.tsx
│   │   └── hooks/
│   │       ├── useWebSocket.ts
│   │       └── useServerConnection.ts
│   ├── content/
│   │   └── content-script.ts     # Page context injection
│   └── popup/
│       ├── popup.html            # Quick access popup
│       └── popup. tsx
└── assets/
    ├── icons/
    └── styles/
```

### 3.2 Server Communication

#### API Endpoints (Based on Nodetool Architecture)

**Chat Communication:**
```typescript
// WebSocket connection for real-time chat
ws://localhost:8000/chat? api_key=YOUR_KEY

// HTTP endpoints for workflows
POST http://localhost:8000/api/workflows/{id}/run
GET  http://localhost:8000/api/workflows/
GET  http://localhost:8000/health/
```

**Message Protocol:**
- Binary (MessagePack) for WebSocket messages
- JSON fallback for HTTP endpoints
- Streaming support for real-time responses

#### Authentication
- Bearer token authentication
- API key via query parameter or header
- Support for `AUTH_PROVIDER` modes:  `local`, `static`, `supabase`

### 3.3 Technology Stack

**Frontend:**
- React 18+ with TypeScript
- Material-UI or Tailwind CSS for UI components
- Vite for build tooling
- MessagePack for binary protocol

**Extension APIs:**
- Chrome Extension Manifest V3
- `chrome.sidePanel` API (Chrome 114+)
- `chrome.storage` for settings persistence
- `chrome.tabs` for context awareness
- `chrome.runtime` for messaging

**Communication:**
- WebSocket API for real-time chat
- Fetch API for HTTP requests
- Reconnection logic with exponential backoff

---

## 4. Core Features

### 4.1 Chat Side Panel (MVP)

#### Requirements
- **Persistent Side Panel:** Available across all tabs without reloading
- **Real-time Streaming:** Display AI responses as they generate
- **Message History:** Persist conversations locally using `chrome.storage`
- **Model Selection:** Choose from available Nodetool models
- **Context Injection:** Option to include current page content in prompts

#### UI Components
```typescript
interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content:  string;
  timestamp: number;
  model?:  string;
}

interface ChatState {
  messages: ChatMessage[];
  isConnected: boolean;
  isStreaming: boolean;
  currentModel: string;
  threadId?: string;
}
```

#### User Flow
1. User opens side panel via extension icon or keyboard shortcut
2. Extension checks server connection status
3. User enters message in chat input
4. Optional:  Include page context via checkbox
5. Message sent via WebSocket to `/chat` endpoint
6. Streaming response rendered in real-time
7. Messages persist across page navigation

### 4.2 Server Connection Management

#### Settings Interface
```typescript
interface ServerConfig {
  url: string;              // e.g., "http://localhost:8000"
  apiKey?:  string;          // Optional API key
  authProvider:  "local" | "static" | "supabase";
  autoConnect:  boolean;     // Connect on startup
  reconnectAttempts: number;
}
```

#### Connection States
- **Disconnected:** Red indicator, retry button visible
- **Connecting:** Yellow indicator, "Connecting..." message
- **Connected:** Green indicator, full functionality enabled
- **Error:** Red indicator with error message and troubleshooting link

#### Health Check
```typescript
// Periodic health check every 10 seconds
async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${serverUrl}/health/`);
    return response.ok;
  } catch (error) {
    return false;
  }
}
```

### 4.3 Workflow Integration (Phase 2)

#### Workflow List
- Fetch available workflows from `/api/workflows/`
- Display workflow cards with:
  - Name and description
  - Input parameters
  - Expected outputs
  - Run button

#### Workflow Execution
```typescript
interface WorkflowExecution {
  workflowId: string;
  params: Record<string, any>;
  stream: boolean;
}

// Run workflow with page context
async function runWorkflow(execution: WorkflowExecution) {
  const response = await fetch(
    `${serverUrl}/api/workflows/${execution.workflowId}/run`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        params: {
          ...execution.params,
          pageUrl: currentTab. url,
          pageContent: includeContext ? pageContent : undefined
        }
      })
    }
  );
  return response.json();
}
```

### 4.4 Context Integration

#### Page Context Capture
- Extract page text content
- Capture selected text
- Include page URL and title
- Optional screenshot capture

```typescript
// Content script injection
function capturePageContext(): PageContext {
  return {
    url: window.location.href,
    title: document.title,
    selectedText: window.getSelection()?.toString() || "",
    bodyText: document.body.innerText. slice(0, 10000), // Limit length
    timestamp: Date.now()
  };
}
```

### 4.5 Agent Mode Integration

Based on Nodetool's agent system, enable autonomous task execution:

- **Agent Controls:** Start/stop agent mode
- **Task Planning:** Show agent's planned steps
- **Tool Execution:** Display tools being called
- **Progress Tracking:** Real-time status of multi-step workflows

---

## 5. User Interface Design

### 5.1 Side Panel Layout

```
┌─────────────────────────────────┐
│ ⚙️ Settings  🔌 Connected      │ ← Header
├─────────────────────────────────┤
│                                 │
│  Assistant:  Hello! How can...   │
│                                 │
│  You:  Summarize this page      │
│                                 │
│  Assistant: [Streaming...]     │
│                                 │
│                                 │ ← Chat History
│                                 │   (Scrollable)
├─────────────────────────────────┤
│ ☐ Include page content         │ ← Context Options
├─────────────────────────────────┤
│ Type a message...         [🎙️] │ ← Input Area
│                            [📎] │
└─────────────────────────────────┘
```

### 5.2 Settings Panel

**Server Configuration:**
- Server URL input (default: `http://localhost:8000`)
- API Key input (masked)
- Auth provider selection
- Connection test button

**Chat Settings:**
- Default model selection
- Auto-include page context toggle
- Message history retention (days)
- Clear history button

**Workflow Settings:**
- Enable workflow integration toggle
- Favorite workflows list
- Quick action keyboard shortcuts

### 5.3 Quick Access Popup

Small popup accessible via extension icon:
```
┌──────────────────────────┐
│ Nodetool                 │
│ 🟢 Connected             │
├──────────────────────────┤
│ 💬 Open Chat             │
│ 📋 Workflows             │
│ ⚙️ Settings              │
└──────────────────────────┘
```

---

## 6. Technical Requirements

### 6.1 Chrome Extension Manifest V3

```json
{
  "manifest_version": 3,
  "name": "Nodetool Assistant",
  "version": "1.0.0",
  "description": "AI-powered workflow automation and chat from your Nodetool server",
  "permissions": [
    "sidePanel",
    "storage",
    "activeTab",
    "scripting"
  ],
  "host_permissions": [
    "http://localhost:*/*",
    "https://*/*"
  ],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "action":  {
    "default_popup":  "popup/popup.html"
  },
  "side_panel": {
    "default_path": "sidepanel/index. html"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/content-script. js"]
    }
  ],
  "icons": {
    "16": "assets/icons/icon16.png",
    "48": "assets/icons/icon48.png",
    "128": "assets/icons/icon128.png"
  }
}
```

### 6.2 WebSocket Connection Management

```typescript
class NodetoolWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: number = 0;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts:  number = 5;

  async connect(url: string, apiKey?: string): Promise<void> {
    const wsUrl = `${url.replace('http', 'ws')}/chat${apiKey ? `?api_key=${apiKey}` : ''}`;
    
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => {
      console.log('Connected to Nodetool server');
      this.reconnectAttempts = 0;
      this.onConnectionChange? .(true);
    };
    
    this.ws.onmessage = async (event) => {
      const data = msgpack.decode(new Uint8Array(await event.data. arrayBuffer()));
      this.handleMessage(data);
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.onConnectionChange?.(false);
    };
    
    this.ws.onclose = () => {
      this.onConnectionChange?.(false);
      this.attemptReconnect();
    };
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      this.reconnectAttempts++;
      setTimeout(() => this.connect(this.serverUrl, this.apiKey), delay);
    }
  }

  sendMessage(message: ChatMessage): void {
    if (this.ws?. readyState === WebSocket. OPEN) {
      this.ws.send(msgpack.encode(message));
    }
  }
}
```

### 6.3 Message Protocol

**Outgoing Message (User → Server):**
```typescript
interface OutgoingMessage {
  role: "user";
  content: string;
  model?: string;
  thread_id?: string;
  context?: {
    pageUrl?: string;
    pageTitle?: string;
    selectedText?:  string;
    pageContent?: string;
  };
}
```

**Incoming Message (Server → Extension):**
```typescript
interface IncomingMessage {
  type: "chunk" | "complete" | "error" | "tool_call";
  content?:  string;
  error?: string;
  tool?:  {
    name: string;
    arguments: any;
  };
  finish_reason?: "stop" | "length" | "tool_calls";
}
```

### 6.4 Storage Schema

```typescript
interface StoredData {
  serverConfig: ServerConfig;
  chatHistory: {
    [threadId: string]: ChatMessage[];
  };
  settings: {
    defaultModel: string;
    autoIncludeContext: boolean;
    theme: "light" | "dark";
    historyRetentionDays: number;
  };
  favoriteWorkflows: string[];
}
```

---

## 7. Security & Privacy

### 7.1 Security Considerations

**Authentication:**
- Secure storage of API keys using `chrome.storage. local` (encrypted)
- No hardcoded credentials
- Support for Bearer token authentication

**CORS & CSP:**
- Proper Content Security Policy in manifest
- Handle CORS for self-hosted servers
- Validate server certificates for HTTPS connections

**Data Privacy:**
- All data stays between extension and user's Nodetool server
- No third-party analytics or tracking
- Clear data retention policies

### 7.2 Privacy Features

- **Local Storage Only:** Chat history stored locally in browser
- **Manual Clear:** User-controlled history deletion
- **Opt-in Context Sharing:** Explicit consent for page content inclusion
- **No Cloud Sync:** Extension doesn't sync data to external servers

---

## 8. Development Phases

### Phase 1: MVP (Weeks 1-4)
**Goal:** Basic chat functionality with side panel

- ✅ Chrome Extension scaffold with Manifest V3
- ✅ Side panel with React UI
- ✅ WebSocket connection to `/chat` endpoint
- ✅ Real-time streaming chat interface
- ✅ Server connection management
- ✅ Settings page with server configuration
- ✅ Basic message history persistence

**Deliverables:**
- Functional extension installable locally
- Documentation for setup and configuration
- Demo video showing chat functionality

### Phase 2: Workflow Integration (Weeks 5-6)
**Goal:** Enable workflow execution from extension

- ✅ Fetch and display workflow list
- ✅ Workflow execution with parameter input
- ✅ Stream workflow progress updates
- ✅ Display workflow results
- ✅ Favorite workflows feature

**Deliverables:**
- Workflow panel in side UI
- Integration tests with sample workflows

### Phase 3: Context Integration (Weeks 7-8)
**Goal:** Enable browser context awareness

- ✅ Content script for page context capture
- ✅ Selected text injection
- ✅ Page summarization workflows
- ✅ Screenshot capture (optional)
- ✅ Context inclusion toggle

**Deliverables:**
- Context-aware chat and workflows
- Example use cases documentation

### Phase 4: Polish & Publishing (Weeks 9-10)
**Goal:** Production-ready extension

- ✅ UI/UX refinements
- ✅ Error handling and edge cases
- ✅ Comprehensive testing (unit + E2E)
- ✅ Chrome Web Store listing preparation
- ✅ User documentation and tutorials
- ✅ Privacy policy and terms

**Deliverables:**
- Published extension on Chrome Web Store
- Complete user documentation
- Video tutorials

---

## 9. Success Metrics

### 9.1 Adoption Metrics
- **Downloads:** Target 1,000 installs in first 3 months
- **Active Users:** 60% weekly active users
- **Retention:** 40% 30-day retention rate

### 9.2 Engagement Metrics
- **Messages per Session:** Average 5-10 messages
- **Workflow Executions:** 50% of users run workflows monthly
- **Feature Usage:** 70% use chat, 30% use workflows

### 9.3 Technical Metrics
- **Connection Uptime:** 99% successful connections
- **Message Latency:** < 500ms to first token
- **Error Rate:** < 5% failed requests

### 9.4 User Satisfaction
- **Rating:** Target 4.5+ stars on Chrome Web Store
- **Reviews:** Positive sentiment in 80% of reviews
- **Support Tickets:** < 10 support requests per 100 users

---

## 10. Risks & Mitigations

### 10.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| WebSocket connection stability | High | Medium | Implement robust reconnection logic with exponential backoff |
| Chrome API changes | Medium | Low | Follow Chrome extension best practices, monitor deprecation notices |
| Server compatibility issues | High | Medium | Test against multiple Nodetool versions, provide version compatibility warnings |
| Performance with large page content | Medium | High | Limit context size, implement intelligent content extraction |

### 10.2 User Experience Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Complex server setup | High | High | Provide detailed setup guide, auto-detect local servers |
| Confusing workflow parameters | Medium | Medium | Clear UI labels, tooltips, example values |
| Privacy concerns | High | Low | Clear privacy policy, local-only data storage messaging |

### 10.3 Adoption Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Limited awareness | High | High | Community outreach, Discord/forum posts, demo videos |
| Nodetool server requirement barrier | High | High | Emphasize value, provide easy local setup instructions |
| Competition from existing tools | Medium | Medium | Focus on unique Nodetool integration, workflow automation features |

---

## 11. Dependencies & Prerequisites

### 11.1 External Dependencies

**Nodetool Server:**
- Nodetool server running (local or remote)
- Minimum version: Latest stable release
- Required endpoints: `/chat`, `/api/workflows/`, `/health/`

**Browser:**
- Chrome 114+ (for Side Panel API)
- Edge 114+ (Chromium-based)

**User Setup:**
- Nodetool desktop app OR self-hosted server
- Network access to server (localhost or VPN)
- Optional: API key for authenticated servers

### 11.2 Development Dependencies

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom":  "^18.2.0",
    "@msgpack/msgpack": "^3.0.0",
    "@mui/material": "^5.14.0",
    "zustand": "^4.4.0"
  },
  "devDependencies":  {
    "typescript": "^5.2.0",
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.2.0",
    "@types/chrome": "^0.0.254",
    "vitest": "^1.0.0",
    "playwright": "^1.40.0"
  }
}
```

---

## 12. Documentation Requirements

### 12.1 User Documentation

1. **Quick Start Guide**
   - Installation steps
   - Server connection setup
   - First chat interaction

2. **Features Guide**
   - Chat interface walkthrough
   - Workflow execution tutorial
   - Context integration examples

3. **Configuration Guide**
   - Server settings explained
   - Authentication setup (local, static, Supabase)
   - Advanced options

4. **Troubleshooting**
   - Common connection issues
   - API key problems
   - Browser compatibility

### 12.2 Developer Documentation

1. **Architecture Overview**
   - Extension structure
   - Communication flow
   - State management

2. **API Integration**
   - WebSocket protocol
   - HTTP endpoints usage
   - Message formats

3. **Build & Deploy**
   - Development setup
   - Build process
   - Chrome Web Store submission

4. **Contributing Guide**
   - Code style guidelines
   - Testing requirements
   - PR process

---

## 13. Future Enhancements (Post-MVP)

### Phase 5+: Advanced Features

**Agent Mode Enhancements:**
- Full agent autonomy with browser tool access
- Multi-step task planning visualization
- Approval workflows for sensitive actions

**Workflow Builder:**
- Visual workflow editor in side panel
- Quick workflow creation from common tasks
- Workflow templates marketplace

**Multi-Modal Support:**
- Image generation preview in side panel
- Video/audio playback for media workflows
- Document viewer for processing results

**Collaboration Features:**
- Share workflows with team members
- Collaborative chat sessions
- Workflow usage analytics

**Advanced Context:**
- DOM element selection for precise context
- Multiple page aggregation
- Browser history integration

**Mobile Companion:**
- Sync with Nodetool mobile app
- Cross-device workflow execution
- Notification support

---

## 14. Open Questions

1. **Model Selection:** Should we auto-detect available models from server or require manual configuration?
2. **Offline Behavior:** How should extension behave when server is unreachable?  Cache messages?
3. **Multi-Server Support:** Should users be able to configure multiple Nodetool servers and switch between them?
4. **Workflow Parameter Validation:** Should extension validate workflow parameters before submission?
5. **Context Size Limits:** What's the optimal max page content size to include in chat context? 
6. **Keyboard Shortcuts:** Which keyboard shortcuts should we support for power users?

---

## 15. Appendices

### Appendix A:  API Endpoint Reference

**Chat WebSocket:**
```
ws://localhost:8000/chat?api_key=YOUR_KEY
```

**Workflows:**
```
GET  /api/workflows/              # List workflows
POST /api/workflows/{id}/run      # Execute workflow
GET  /api/workflows/{id}          # Get workflow details
```

**Health:**
```
GET /health/                      # Server health check
```

### Appendix B: Sample Message Flow

**User sends message:**
```json
{
  "role": "user",
  "content": "Summarize this page",
  "context": {
    "pageUrl":  "https://example.com",
    "pageTitle": "Example Page",
    "pageContent": "Lorem ipsum..."
  }
}
```

**Server streams response:**
```json
{"type": "chunk", "content": "This"}
{"type": "chunk", "content": " page"}
{"type": "chunk", "content": " discusses... "}
{"type": "complete", "finish_reason": "stop"}
```

### Appendix C: Competitor Analysis

**ChatGPT Chrome Extension:**
- ✅ Strong:  Polished UI, reliable connection
- ❌ Weak: Cloud-only, no workflow integration, no self-hosting

**Cursor Browser Extension:**
- ✅ Strong: Code-aware context
- ❌ Weak:  Developer-focused only, no visual workflows

**Nodetool Extension (Proposed):**
- ✅ Strong: Self-hosted privacy, workflow automation, visual AI builder integration
- ❌ Weak:  Requires Nodetool server setup

---

## 16. Conclusion

The Nodetool Chrome Extension bridges the gap between browser-based workflows and Nodetool's powerful AI capabilities. By providing a persistent chat sidepanel and workflow execution interface, users gain contextual AI assistance without leaving their browsing context.

**Key Success Factors:**
1.  Seamless server connection experience
2. Intuitive chat interface with streaming responses
3. Powerful workflow integration with minimal friction
4. Strong privacy and security positioning
5. Comprehensive documentation and onboarding

**Next Steps:**
1. Review and approve PRD
2. Create detailed technical specification
3. Set up development environment
4. Begin Phase 1 implementation
5. Establish testing strategy

---

**Document History:**
- v1.0 (2026-01-02): Initial draft created

**Approvals:**
- [ ] Product Lead
- [ ] Engineering Lead
- [ ] Design Lead
- [ ] Security Review
