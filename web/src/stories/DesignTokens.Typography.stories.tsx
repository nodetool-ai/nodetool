import type { Meta, StoryObj } from "@storybook/react-vite";
import { Box } from "@mui/material";
import { TYPOGRAPHY } from "../components/ui_primitives/tokens";

/**
 * The eight — and only eight — sanctioned text styles (four sans, four mono).
 * Any drift in font size, weight, or family shows up here.
 */
const Row = ({ name, style }: { name: string; style: Record<string, unknown> }) => (
  <Box
    sx={{
      display: "grid",
      gridTemplateColumns: "160px 1fr",
      alignItems: "baseline",
      gap: 2,
      py: 1,
      borderBottom: "1px solid var(--palette-divider)"
    }}
  >
    <Box
      sx={{ fontFamily: "var(--fontFamily2)", fontSize: "var(--fontSizeSmaller)", opacity: 0.7 }}
    >
      {name}
    </Box>
    <Box sx={style}>The quick brown fox jumps over the lazy dog</Box>
  </Box>
);

const TypeScale = () => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 720 }}>
    <Box>
      <Box sx={{ ...TYPOGRAPHY.sans.title, mb: 1 }}>Sans (Inter)</Box>
      {Object.entries(TYPOGRAPHY.sans).map(([role, style]) => (
        <Row key={role} name={`sans.${role}`} style={style} />
      ))}
    </Box>
    <Box>
      <Box sx={{ ...TYPOGRAPHY.sans.title, mb: 1 }}>Mono (JetBrains Mono)</Box>
      {Object.entries(TYPOGRAPHY.mono).map(([role, style]) => (
        <Row key={role} name={`mono.${role}`} style={style} />
      ))}
    </Box>
  </Box>
);

const meta = {
  title: "Design Tokens/Typography",
  component: TypeScale,
  parameters: { layout: "padded" }
} satisfies Meta<typeof TypeScale>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Scale: Story = {};
