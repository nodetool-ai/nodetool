import React, { useRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { VirtualList, VirtualListHandle } from "../VirtualList";

type Row = { id: string; label: string };

const rows: Row[] = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Bravo" },
  { id: "c", label: "Charlie" }
];

const renderWithTheme = (component: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);

describe("VirtualList", () => {
  // jsdom reports every element as 0x0, and the virtualizer renders nothing
  // when its scroll container has no measurable height. Give it one.
  const sizedProps = {
    offsetWidth: { configurable: true, value: 300 },
    offsetHeight: { configurable: true, value: 300 }
  };
  const original = {
    offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth"),
    offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")
  };

  beforeAll(() => {
    Object.defineProperties(HTMLElement.prototype, sizedProps);
  });

  afterAll(() => {
    if (original.offsetWidth) {
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", original.offsetWidth);
    }
    if (original.offsetHeight) {
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", original.offsetHeight);
    }
  });

  it("renders one row per item", () => {
    renderWithTheme(
      <VirtualList
        items={rows}
        estimateSize={40}
        getItemKey={(row) => row.id}
        ariaLabel="Test rows"
        renderItem={(row) => <span>{row.label}</span>}
      />
    );

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });

  it("labels the list and defaults its role to list", () => {
    renderWithTheme(
      <VirtualList
        items={rows}
        estimateSize={40}
        ariaLabel="Test rows"
        renderItem={(row) => <span>{row.label}</span>}
      />
    );

    expect(screen.getByRole("list", { name: "Test rows" })).toBeInTheDocument();
  });

  it("accepts a custom role and per-row props", () => {
    renderWithTheme(
      <VirtualList
        items={rows}
        estimateSize={40}
        role="listbox"
        ariaLabel="Options"
        getItemProps={(row) => ({ role: "option", "data-id": row.id } as React.HTMLAttributes<HTMLDivElement>)}
        renderItem={(row) => <span>{row.label}</span>}
      />
    );

    expect(screen.getByRole("listbox", { name: "Options" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(rows.length);
  });

  it("positions rows absolutely with a translateY offset", () => {
    const { container } = renderWithTheme(
      <VirtualList
        items={rows}
        estimateSize={40}
        ariaLabel="Test rows"
        renderItem={(row) => <span>{row.label}</span>}
      />
    );

    const list = container.querySelector('[role="list"]') as HTMLElement;
    const rowEls = Array.from(list.children) as HTMLElement[];
    expect(rowEls).toHaveLength(rows.length);
    expect(rowEls[0].style.position).toBe("absolute");
    expect(rowEls[0].style.transform).toBe("translateY(0px)");
    expect(rowEls[1].style.transform).toBe("translateY(40px)");
    expect(rowEls[1].style.height).toBe("40px");
  });

  it("renders nothing but the spacer for an empty list", () => {
    const { container } = renderWithTheme(
      <VirtualList
        items={[] as Row[]}
        estimateSize={40}
        ariaLabel="Test rows"
        renderItem={(row: Row) => <span>{row.label}</span>}
      />
    );

    const list = container.querySelector('[role="list"]') as HTMLElement;
    expect(list.children).toHaveLength(0);
  });

  it("exposes the scroll element and imperative helpers through the ref", async () => {
    const seen: { el: HTMLElement | null; hasScroll: boolean } = {
      el: null,
      hasScroll: false
    };

    const Harness = () => {
      const ref = useRef<VirtualListHandle>(null);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              seen.el = ref.current?.getScrollElement() ?? null;
              seen.hasScroll = typeof ref.current?.scrollToIndex === "function";
              ref.current?.measure();
            }}
          >
            probe
          </button>
          <VirtualList
            ref={ref}
            items={rows}
            estimateSize={40}
            ariaLabel="Test rows"
            renderItem={(row: Row) => <span>{row.label}</span>}
          />
        </>
      );
    };

    renderWithTheme(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "probe" }));

    expect(seen.el).toBeInstanceOf(HTMLElement);
    expect(seen.hasScroll).toBe(true);
  });
});
