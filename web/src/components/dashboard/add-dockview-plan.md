# Plan: Refactor Dashboard.tsx to Use Dockview

## 1. Goals

- Replace the current CSS grid-based layout in `Dashboard.tsx` with Dockview's docking layout manager.
- Map each dashboard section (Examples, Recent Chats, Recent Workflows, Chat) to Dockview panels.
- Preserve all existing features and functionality.
- Ensure the dashboard remains responsive and user-friendly.

## 2. Mapping Current Sections to Dockview Panels

| Current Section  | Dockview Panel ID | Notes                             |
| ---------------- | ----------------- | --------------------------------- |
| Examples         | examples          | Top panel, can be docked/floated  |
| Recent Chats     | threads           | Side panel, dockable              |
| Recent Workflows | workflows         | Main panel, dockable              |
| Chat             | chat              | Bottom panel, dockable, resizable |

## 3. Integration Steps

1. **Install Dockview** (already done)
2. **Import Dockview Components**
   - Import `DockviewReact` and related APIs from Dockview.
3. **Define Panel Components**
   - Extract each dashboard section (Examples, Threads, Workflows, Chat) into its own React component for use as a Dockview panel.
4. **Set Up Dockview Layout**
   - Initialize Dockview with a layout that mimics the current dashboard structure.
   - Assign each section to a Dockview panel with appropriate IDs and titles.
   - Configure initial positions (e.g., Examples at top, Workflows center, Threads left, Chat bottom).
5. **Panel Content Migration**
   - Move the JSX and logic for each section into its respective panel component.
   - Ensure all props, state, and handlers are passed correctly.
6. **Handle Panel Interactions**
   - Enable drag-and-drop, resizing, and floating for panels as appropriate.
   - Ensure that navigation and actions (e.g., opening a workflow, starting a chat) work as before.
7. **Styling and Theming**
   - Integrate Dockview theming with the existing MUI/Emotion theme.
   - Adjust styles as needed to maintain a cohesive look.
8. **Responsiveness**
   - Test and adjust Dockview's layout for different screen sizes.
   - Ensure panels can be collapsed, resized, or rearranged for mobile/desktop.
9. **Serialization/Deserialization (Optional)**
   - Optionally, persist the user's custom layout using Dockview's serialization API.
10. **Testing and QA**
    - Verify all dashboard features work as before.
    - Test panel docking, undocking, resizing, and layout persistence.
    - Ensure accessibility and keyboard navigation.

## 4. Migration Considerations

- **State Management:** Ensure that moving logic into panel components does not break context or state dependencies.
- **Routing:** Ensure navigation (e.g., to editor or chat) still works from within panels.
- **Performance:** Monitor for any performance regressions due to Dockview integration.
- **Feature Parity:** Double-check that no features are lost in the migration.

## 5. Next Steps

- [ ] Extract dashboard sections into panel components.
- [ ] Set up Dockview layout in Dashboard.tsx.
- [ ] Integrate and test each panel.
- [ ] Polish styles and interactions.
- [ ] Final QA and review.
