import type { Meta, StoryObj } from "@storybook/react-vite";
import { FlexRow } from "../components/ui_primitives/FlexRow";
import { FlexColumn } from "../components/ui_primitives/FlexColumn";

const Tile = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      padding: "8px 16px",
      borderRadius: "var(--rounded-md)",
      backgroundColor: "var(--palette-primary-main)",
      color: "var(--palette-primary-contrastText)",
      fontFamily: "var(--fontFamily2)",
      fontSize: "var(--fontSizeSmall)"
    }}
  >
    {children}
  </div>
);

const meta = {
  title: "Layout/Flex",
  component: FlexRow,
  argTypes: {
    gap: { control: { type: "range", min: 0, max: 8, step: 1 } },
    align: {
      control: "select",
      options: ["flex-start", "center", "flex-end", "stretch", "baseline"]
    },
    justify: {
      control: "select",
      options: [
        "flex-start",
        "center",
        "flex-end",
        "space-between",
        "space-around",
        "space-evenly"
      ]
    }
  }
} satisfies Meta<typeof FlexRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Row: Story = {
  args: { gap: 2, align: "center" },
  render: (args) => (
    <FlexRow {...args} sx={{ width: 420, border: "1px dashed var(--palette-divider)", p: 2 }}>
      <Tile>One</Tile>
      <Tile>Two</Tile>
      <Tile>Three</Tile>
    </FlexRow>
  )
};

export const RowSpaceBetween: Story = {
  args: { gap: 2, justify: "space-between" },
  render: (args) => (
    <FlexRow {...args} sx={{ width: 420, border: "1px dashed var(--palette-divider)", p: 2 }}>
      <Tile>Left</Tile>
      <Tile>Right</Tile>
    </FlexRow>
  )
};

export const Column: Story = {
  render: () => (
    <FlexColumn gap={2} sx={{ width: 200, border: "1px dashed var(--palette-divider)", p: 2 }}>
      <Tile>First</Tile>
      <Tile>Second</Tile>
      <Tile>Third</Tile>
    </FlexColumn>
  )
};
