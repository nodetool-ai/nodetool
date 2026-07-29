import type { Meta, StoryObj } from "@storybook/react-vite";
import { Surface } from "../components/ui_primitives/Surface";

const body = (
  <div style={{ width: 200, fontFamily: "var(--fontFamily1)", fontSize: "var(--fontSizeSmall)" }}>
    Surface content
  </div>
);

const meta = {
  title: "Surfaces/Surface",
  component: Surface,
  args: {
    elevation: 1,
    padding: 2,
    rounded: "medium",
    bordered: false,
    background: "paper",
    children: body
  },
  argTypes: {
    elevation: { control: { type: "range", min: 0, max: 4, step: 1 } },
    rounded: { control: "select", options: ["none", "small", "medium", "large"] },
    background: { control: "select", options: ["default", "paper", "transparent"] },
    bordered: { control: "boolean" }
  }
} satisfies Meta<typeof Surface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Flat: Story = {
  args: { elevation: 0, bordered: true }
};

export const Raised: Story = {
  args: { elevation: 2 }
};

export const Elevations: Story = {
  render: (args) => (
    <div style={{ display: "flex", gap: 24 }}>
      {[0, 1, 2, 3, 4].map((e) => (
        <Surface key={e} {...args} elevation={e as 0 | 1 | 2 | 3 | 4}>
          <div style={{ fontFamily: "var(--fontFamily2)", fontSize: "var(--fontSizeSmaller)" }}>
            elevation {e}
          </div>
        </Surface>
      ))}
    </div>
  )
};
