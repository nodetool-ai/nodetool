# Workflow Assistant – Feature Plan

## 1. Purpose

Provide an in-product "assistant" that lives inside the right-hand panel and can help users with the _current_ workflow. In the first iteration the assistant is read-only: it answers questions about the workflow and suggests possible changes. It always starts with **help mode** toggled on when opened. A later iteration will allow the assistant to apply edits to the workflow (Copilot-style experience).

## 2. High-level user story

"As a workflow author, I want to click an assistant icon and chat with an AI that understands my current workflow so that I can quickly get guidance, fix errors, and learn best practices without leaving the editor."

## 3. Scope (v0)

• Add a new icon to the right-panel toolbar (e.g. `SmartToy` or custom bot icon).  
• Clicking the icon shows a ChatView inside the existing right drawer instead of the Inspector.  
• The ChatView is initialised with `helpMode = true`.  
• Only one of Inspector _or_ Assistant is visible at a time.  
• Assistant inherits the width, resize & show/hide behaviour that the Inspector already has.

Out-of-scope (future):  
– Assistant proposing/performing edits.  
– Persisting assistant state per-workflow.

## 4. UX / UI details

1. **Toolbar changes**
   • Add second button under existing Inspector button.  
   • Tooltip: "Workflow Assistant (⌥ A)" (shortcut TBD).  
   • Active button highlights when the assistant is the current panel.
2. **Drawer content switching**
   • Create an `activeTab` state in `RightPanelStore` with enum `'inspector' | 'assistant'`.  
   • `handlePanelToggle(tab)` sets visibility **and** activeTab.
   • `PanelRight` renders `<Inspector />` _or_ `<WorkflowAssistantChat />` based on `activeTab`.
3. **Chat implementation**
   • Re-use existing `ChatView` component used by `GlobalChat`.  
   • Create wrapper component `WorkflowAssistantChat` that:
   – sets `helpMode` prop to `true` by default and hides the Help-Mode toggle (always on).  
    – passes the current workflow via context to the backend (see §5).  
    – can share the same websocket connection as GlobalChat

## 5. Data & backend considerations

• Client must pass `workflow_id` and `helpMode=true` in the `Message` payload so that the server can scope answers.  
• No server changes are required if the backend already supports `help:` model prefix and can interpret `workflow_id`.

## 6. State management changes

```
RightPanelStore
{
  panel: { isVisible: boolean, size: number },
  activeTab: 'inspector' | 'assistant',
  // actions
  toggleTab(tabName) { ... }
}
```

## 7. Component tree (simplified)

```
PanelRight
└─ VerticalToolbar
   ├─ IconButton (Inspector)
   └─ IconButton (Assistant)
└─ Drawer
   └─ panel-content
      ├─ <Inspector />   (if activeTab === 'inspector')
      └─ <WorkflowAssistantChat /> (if activeTab === 'assistant')
```

## 8. Accessibility & keyboard shortcuts

• New shortcut suggestion: `Shift + A` to open assistant.  
• Announce when connection status changes (similar to GlobalChat alerts).

## 9. Analytics

• Track events: assistant_opened, assistant_message_sent.

## 10. Future roadmap (beyond v0)

1. **Automated edits:** allow the assistant to propose and apply patches to the workflow graph.
2. **Inline suggestions:** ghost nodes/edges that can be accepted or rejected.
3. **Contextual commands:** "Refactor selected nodes", "Generate logging", etc.

## 11. Implementation tasks (checklist)

- [ ] Update `RightPanelStore` to track `activeTab`.
- [ ] Add Assistant icon & tooltip to `VerticalToolbar` in `PanelRight.tsx`.
- [ ] Implement `WorkflowAssistantChat` wrapper component.
- [ ] Pass `workflow_id` and `helpMode=true` to chat backend.
- [ ] Unit tests for store & component switching.
- [ ] E2E test: open assistant, send message, confirm response.
- [ ] Docs & release notes.

---
