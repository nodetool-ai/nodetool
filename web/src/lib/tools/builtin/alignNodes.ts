import { FrontendToolRegistry } from "../frontendTools";

type Direction =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "vertical_center"
  | "horizontal_center";

FrontendToolRegistry.register({
  name: "ui_align_nodes",
  description:
    "Align nodes by direction. Uses provided node_ids or current selection.",
  parameters: {
    type: "object",
    properties: {
      direction: {
        type: "string",
        enum: [
          "left",
          "right",
          "top",
          "bottom",
          "vertical_center",
          "horizontal_center"
        ]
      },
      node_ids: { type: "array", items: { type: "string" } }
    },
    required: ["direction"]
  },
  async execute({ direction, node_ids }: { direction: Direction; node_ids?: string[] }, ctx) {
    const { nodeStore } = ctx.getState();
    const all = nodeStore.getSelectedNodes();
    const nodes = (node_ids && node_ids.length
      ? node_ids
          .map((id) => nodeStore.findNode(id))
          .filter(Boolean)
      : all) as any[];

    if (!nodes || nodes.length < 2) {
      return { ok: false, error: "Need at least two nodes to align" };
    }

    const xs = nodes.map((n) => n.position.x);
    const ys = nodes.map((n) => n.position.y);
    const rights = nodes.map((n) => n.position.x + (n.measured?.width ?? n.width ?? 100));
    const bottoms = nodes.map((n) => n.position.y + (n.measured?.height ?? n.height ?? 100));

    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...rights);
    const bottom = Math.max(...bottoms);
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;

    for (const n of nodes) {
      const width = n.measured?.width ?? n.width ?? 100;
      const height = n.measured?.height ?? n.height ?? 100;
      if (direction === "left") {
        nodeStore.updateNode(n.id, { position: { x: left, y: n.position.y } });
      } else if (direction === "right") {
        nodeStore.updateNode(n.id, { position: { x: right - width, y: n.position.y } });
      } else if (direction === "top") {
        nodeStore.updateNode(n.id, { position: { x: n.position.x, y: top } });
      } else if (direction === "bottom") {
        nodeStore.updateNode(n.id, { position: { x: n.position.x, y: bottom - height } });
      } else if (direction === "vertical_center") {
        nodeStore.updateNode(n.id, { position: { x: n.position.x, y: centerY - height / 2 } });
      } else if (direction === "horizontal_center") {
        nodeStore.updateNode(n.id, { position: { x: centerX - width / 2, y: n.position.y } });
      }
    }

    return { ok: true, count: nodes.length, direction };
  }
});

