import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TabGroup } from "../components/ui_primitives/TabGroup";

const tabs = [
  { value: "overview", label: "Overview" },
  { value: "params", label: "Parameters" },
  { value: "logs", label: "Logs" }
];

const meta = {
  title: "Primitives/TabGroup",
  component: TabGroup,
  args: {
    tabs,
    value: "overview",
    onChange: () => {},
    size: "small"
  },
  argTypes: {
    size: { control: "select", options: ["small", "medium"] },
    fullWidth: { control: "boolean" }
  },
  render: (args) => {
    const Controlled = () => {
      const [value, setValue] = useState(args.value);
      return (
        <div style={{ width: 380 }}>
          <TabGroup {...args} value={value} onChange={setValue} />
        </div>
      );
    };
    return <Controlled />;
  }
} satisfies Meta<typeof TabGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FullWidth: Story = {
  args: { fullWidth: true }
};
