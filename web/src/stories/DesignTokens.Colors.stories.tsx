import type { Meta, StoryObj } from "@storybook/react-vite";
import { useTheme } from "@mui/material/styles";
import { Box } from "@mui/material";

/**
 * Palette swatches read straight off the active theme, so this page doubles as
 * a visual diff of any palette change (light or dark) in Chromatic.
 */
const PALETTE_ROLES = [
  "primary",
  "secondary",
  "error",
  "warning",
  "info",
  "success"
] as const;

const Swatch = ({ label, color }: { label: string; color: string }) => (
  <Box
    sx={{
      display: "flex",
      flexDirection: "column",
      gap: 0.5,
      width: 140
    }}
  >
    <Box
      sx={{
        height: 56,
        borderRadius: "var(--rounded-md)",
        backgroundColor: color,
        border: "1px solid var(--palette-divider)"
      }}
    />
    <Box sx={{ fontSize: "var(--fontSizeSmaller)", fontFamily: "var(--fontFamily2)" }}>
      {label}
    </Box>
    <Box
      sx={{
        fontSize: "var(--fontSizeSmaller)",
        fontFamily: "var(--fontFamily2)",
        opacity: 0.6
      }}
    >
      {color}
    </Box>
  </Box>
);

const ColorPalette = () => {
  const theme = useTheme();
  const palette = theme.vars.palette;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {PALETTE_ROLES.map((role) => {
        const group = palette[role] as unknown as
          | Record<string, string>
          | undefined;
        if (!group) return null;
        return (
          <Box key={role}>
            <Box
              sx={{
                fontFamily: "var(--fontFamily1)",
                fontSize: "var(--fontSizeSmall)",
                fontWeight: 600,
                textTransform: "capitalize",
                mb: 1
              }}
            >
              {role}
            </Box>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              {["main", "light", "dark", "contrastText"]
                .filter((tone) => group[tone])
                .map((tone) => (
                  <Swatch key={tone} label={tone} color={group[tone]} />
                ))}
            </Box>
          </Box>
        );
      })}
      <Box>
        <Box
          sx={{
            fontFamily: "var(--fontFamily1)",
            fontSize: "var(--fontSizeSmall)",
            fontWeight: 600,
            mb: 1
          }}
        >
          Surfaces & text
        </Box>
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Swatch label="background.default" color={palette.background.default} />
          <Swatch label="background.paper" color={palette.background.paper} />
          <Swatch label="text.primary" color={palette.text.primary} />
          <Swatch label="text.secondary" color={palette.text.secondary} />
          <Swatch label="divider" color={palette.divider} />
        </Box>
      </Box>
    </Box>
  );
};

const meta = {
  title: "Design Tokens/Colors",
  component: ColorPalette,
  parameters: { layout: "padded" }
} satisfies Meta<typeof ColorPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Palette: Story = {};
