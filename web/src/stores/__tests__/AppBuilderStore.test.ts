import { useAppBuilderStore } from "../AppBuilderStore";
import { createEmptyAppSpec } from "../../components/appbuilder/appSchema";

const reset = () =>
  useAppBuilderStore.setState({
    spec: createEmptyAppSpec(),
    selectedWidgetId: null,
    mode: "design",
    past: [],
    future: []
  });

describe("AppBuilderStore", () => {
  beforeEach(reset);

  it("adds a widget, placing it below existing ones and selecting it", () => {
    const { addWidget } = useAppBuilderStore.getState();
    addWidget("button");
    const state = useAppBuilderStore.getState();
    expect(state.spec.widgets).toHaveLength(1);
    expect(state.spec.widgets[0].type).toBe("button");
    expect(state.selectedWidgetId).toBe(state.spec.widgets[0].id);

    addWidget("text");
    const next = useAppBuilderStore.getState();
    expect(next.spec.widgets).toHaveLength(2);
    // Second widget stacks below the first.
    expect(next.spec.widgets[1].layout.y).toBeGreaterThanOrEqual(
      next.spec.widgets[0].layout.h
    );
  });

  it("updates props, layout, binding, and events", () => {
    const { addWidget } = useAppBuilderStore.getState();
    addWidget("slider");
    const id = useAppBuilderStore.getState().spec.widgets[0].id;

    useAppBuilderStore.getState().setProp(id, "max", 200);
    useAppBuilderStore.getState().setBinding(id, "count");
    useAppBuilderStore.getState().updateLayout(id, { x: 1, y: 2, w: 4, h: 1 });
    useAppBuilderStore
      .getState()
      .setEvents(id, [{ trigger: "change", action: { kind: "run" } }]);

    const widget = useAppBuilderStore.getState().spec.widgets[0];
    expect(widget.props.max).toBe(200);
    expect(widget.binding).toBe("count");
    expect(widget.layout).toEqual({ x: 1, y: 2, w: 4, h: 1 });
    expect(widget.events).toHaveLength(1);
  });

  it("removes a widget and clears selection", () => {
    const { addWidget } = useAppBuilderStore.getState();
    addWidget("button");
    const id = useAppBuilderStore.getState().spec.widgets[0].id;
    useAppBuilderStore.getState().removeWidget(id);
    expect(useAppBuilderStore.getState().spec.widgets).toHaveLength(0);
    expect(useAppBuilderStore.getState().selectedWidgetId).toBeNull();
  });

  it("duplicates a widget below the source", () => {
    const { addWidget } = useAppBuilderStore.getState();
    addWidget("image");
    const id = useAppBuilderStore.getState().spec.widgets[0].id;
    useAppBuilderStore.getState().duplicateWidget(id);
    const widgets = useAppBuilderStore.getState().spec.widgets;
    expect(widgets).toHaveLength(2);
    expect(widgets[1].id).not.toBe(id);
    expect(widgets[1].type).toBe("image");
  });

  it("supports undo and redo", () => {
    const { addWidget } = useAppBuilderStore.getState();
    addWidget("button");
    addWidget("text");
    expect(useAppBuilderStore.getState().spec.widgets).toHaveLength(2);

    useAppBuilderStore.getState().undo();
    expect(useAppBuilderStore.getState().spec.widgets).toHaveLength(1);

    useAppBuilderStore.getState().redo();
    expect(useAppBuilderStore.getState().spec.widgets).toHaveLength(2);
  });

  it("loadSpec resets history and selection", () => {
    const { addWidget } = useAppBuilderStore.getState();
    addWidget("button");
    useAppBuilderStore.getState().loadSpec(createEmptyAppSpec("Fresh"));
    const state = useAppBuilderStore.getState();
    expect(state.spec.widgets).toHaveLength(0);
    expect(state.spec.title).toBe("Fresh");
    expect(state.past).toHaveLength(0);
    expect(state.selectedWidgetId).toBeNull();
  });
});
