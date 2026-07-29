import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SearchInput } from "../components/ui_primitives/SearchInput";

const meta = {
  title: "Primitives/SearchInput",
  component: SearchInput,
  args: {
    value: "",
    onChange: () => {},
    placeholder: "Search…",
    showClear: true,
    size: "small"
  },
  argTypes: {
    size: { control: "select", options: ["small", "medium"] },
    showClear: { control: "boolean" },
    disabled: { control: "boolean" }
  },
  render: (args) => {
    const Controlled = () => {
      const [value, setValue] = useState(args.value);
      return (
        <div style={{ width: 280 }}>
          <SearchInput {...args} value={value} onChange={setValue} />
        </div>
      );
    };
    return <Controlled />;
  }
} satisfies Meta<typeof SearchInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithValue: Story = {
  args: { value: "workflow" }
};
