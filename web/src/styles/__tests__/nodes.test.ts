import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("canvas node styles", () => {
  beforeEach(() => {
    const style = document.createElement("style");
    style.textContent = ["nodes.base.css", "nodes.zoomed.css"]
      .map((file) => readFileSync(join(__dirname, "..", file), "utf8"))
      .join("\n");
    document.head.appendChild(style);
  });

  afterEach(() => {
    document.head.querySelectorAll("style").forEach((style) => style.remove());
    document.body.replaceChildren();
  });

  it.each(["group", "selection"])("moves unselected children without tweening during a %s drag", (kind) => {
    document.body.innerHTML = `<div class="react-flow ${kind === "selection" ? "nodesselection-dragging" : ""}">
      <div class="react-flow__node selected ${kind === "group" ? "dragging" : ""}"></div>
      <div class="react-flow__node child"></div>
    </div>`;
    const child = document.querySelector(".child");
    expect(child).not.toBeNull();
    expect(getComputedStyle(child!).transition).not.toContain("transform");
  });

  it("keeps programmatic moves animated while idle", () => {
    const node = document.createElement("div");
    node.className = "react-flow__node";
    document.body.appendChild(node);
    expect(getComputedStyle(node).transition).toContain("transform");
  });

  it("keeps unrelated nodes readable when a branch is selected", () => {
    document.body.innerHTML = '<div class="react-flow"><div class="react-flow__node branch-dimmed"></div></div>';
    const node = document.querySelector(".react-flow__node");
    expect(node).not.toBeNull();
    expect(Number(getComputedStyle(node!).opacity)).toBeGreaterThanOrEqual(0.6);
    expect(Number(getComputedStyle(node!).opacity)).toBeLessThan(1);
  });
});
