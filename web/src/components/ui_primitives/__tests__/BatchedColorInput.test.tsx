import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import {
  TimelineProvider,
  createTimelineInstance
} from "../../../stores/timeline/TimelineInstance";
import { timelineTemporalOf } from "../../../stores/timeline/TimelineStore";
import { BatchedColorInput } from "../BatchedColorInput";

describe("BatchedColorInput (F46)", () => {
  it("coalesces a picker drag into one write and one undo entry", () => {
    const instance = createTimelineInstance();
    instance.doc.setState({ markers: [] });
    const onChange = jest.fn((color: string) => {
      instance.doc.setState({
        markers: [{ id: "m", timeMs: 0, label: color }] as never
      });
    });
    render(
      <ThemeProvider theme={mockTheme}>
        <TimelineProvider instance={instance}>
          <BatchedColorInput value="#000000" onChange={onChange} ariaLabel="Pick" />
        </TimelineProvider>
      </ThemeProvider>
    );
    const input = screen.getByLabelText("Pick");
    const depth = () => timelineTemporalOf(instance.doc).pastStates.length;
    const before = depth();

    for (const color of ["#111111", "#222222", "#333333"]) {
      fireEvent.input(input, { target: { value: color } });
    }
    act(() => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onChange).toHaveBeenLastCalledWith("#333333");
    expect(onChange.mock.calls.length).toBeLessThanOrEqual(2);
    expect(depth() - before).toBe(1);
  });
});
