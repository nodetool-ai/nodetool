# Theme Preset Feature

## Overview

NodeTool now includes an exciting new theme preset feature that allows users to customize the visual appearance of the application with beautiful, carefully crafted color themes beyond the standard light and dark modes.

## Available Theme Presets

### 1. **Light** (Default Light Theme)
The original light theme with bright, clear colors for daytime use.

### 2. **Dark** (Default Dark Theme)
The original dark theme with deep, comfortable colors for low-light environments.

### 3. **Ocean** 🌊
A cool, refreshing theme inspired by ocean depths featuring:
- Deep blue and teal primary colors
- Cyan and turquoise accents
- Soothing slate grays for backgrounds
- Perfect for long coding sessions and reducing eye strain

### 4. **Forest** 🌲
A natural, earthy theme inspired by forest landscapes featuring:
- Rich green primary colors
- Lime and chartreuse accents
- Warm gray backgrounds
- Ideal for nature lovers and a calming atmosphere

### 5. **Sunset** 🌅
A warm, vibrant theme inspired by sunset skies featuring:
- Pink and magenta primary colors
- Orange and purple accents
- Soft gray backgrounds
- Great for creative work and evening sessions

### 6. **Midnight** 🌙
A sophisticated theme inspired by the night sky featuring:
- Deep purple and indigo primary colors
- Blue and violet accents
- Dark slate backgrounds
- Perfect for late-night work and a premium feel

## How to Use

1. **Open Settings**
   - Click the settings icon in the top navigation
   - Or press the keyboard shortcut (if configured)

2. **Navigate to Theme Settings**
   - Go to the "Editor & View" tab
   - Scroll to the "Appearance" section

3. **Select Your Theme**
   - Use the "Theme Preset" dropdown
   - Choose from: Light, Dark, Ocean, Forest, Sunset, or Midnight
   - The theme will apply immediately

4. **Enjoy Your New Look!**
   - Your theme preference is automatically saved
   - The theme persists across sessions

## Technical Implementation

### Architecture

The theme preset feature is built on MUI's CSS Variables system and integrates seamlessly with the existing theme infrastructure:

- **Theme Palettes**: Each theme preset has a dedicated palette file (`paletteOcean.ts`, `paletteForest.ts`, etc.)
- **Theme Configuration**: `ThemeNodetool.tsx` includes all color schemes
- **Settings Store**: `SettingsStore.ts` manages theme preference with `themePreset` field
- **Theme Sync**: `ThemeSync.tsx` component synchronizes settings with MUI's color scheme
- **UI Integration**: Theme selector added to Settings menu under Appearance section

### Files Added/Modified

#### New Files:
- `web/src/components/themes/paletteOcean.ts` - Ocean theme palette
- `web/src/components/themes/paletteForest.ts` - Forest theme palette
- `web/src/components/themes/paletteSunset.ts` - Sunset theme palette
- `web/src/components/themes/paletteMidnight.ts` - Midnight theme palette
- `web/src/components/themes/ThemeSync.tsx` - Theme synchronization component
- `web/src/components/themes/__tests__/ThemeSync.test.tsx` - Theme sync tests
- `web/src/stores/__tests__/SettingsStore.themePreset.test.ts` - Settings store tests

#### Modified Files:
- `web/src/components/themes/ThemeNodetool.tsx` - Added new color schemes
- `web/src/stores/SettingsStore.ts` - Added themePreset setting and setter
- `web/src/components/menus/SettingsMenu.tsx` - Added theme preset selector UI
- `web/src/components/ui/ThemeToggle.tsx` - Updated to show current theme
- `web/src/index.tsx` - Added ThemeSync component

### Color Palette Structure

Each theme includes carefully chosen colors for:
- Primary and secondary colors
- Error, warning, info, and success states
- Gray scale (0-1000)
- Text colors (primary, secondary, disabled)
- Background colors (default, paper, overlay)
- Action states (hover, selected, disabled, focus, etc.)
- Custom NodeTool colors (nodes, edges, editor elements, providers, etc.)

### Testing

Comprehensive tests ensure the theme feature works correctly:

```bash
# Run theme preset tests
cd web && npm test -- --testPathPattern="SettingsStore.themePreset"

# Run all tests
cd web && npm test
```

Test coverage includes:
- Default theme preset is "dark"
- Setting and persisting each theme preset
- Switching between multiple themes
- Theme sync component behavior

## Design Principles

Each theme was designed with these principles:
1. **Accessibility**: Sufficient contrast ratios for readability
2. **Consistency**: Harmonious color relationships
3. **Purpose**: Each theme evokes a specific mood or use case
4. **Flexibility**: Works across all NodeTool components and layouts

## Future Enhancements

Potential additions to the theme system:
- [ ] Custom theme creator for users
- [ ] More preset themes (e.g., Neon, Retro, Minimal)
- [ ] Theme preview before applying
- [ ] Import/export custom themes
- [ ] Time-based automatic theme switching
- [ ] Per-workspace theme preferences

## FAQ

**Q: Will my theme choice sync across devices?**
A: Currently, theme preferences are stored locally in your browser. Future versions may include cloud sync.

**Q: Can I create my own custom theme?**
A: Not yet through the UI, but developers can add new themes by creating palette files and updating the theme configuration.

**Q: Do themes affect performance?**
A: No, themes are implemented using CSS variables which have minimal performance impact.

**Q: Can I suggest a new theme?**
A: Absolutely! Open an issue on GitHub with your theme idea and color palette suggestions.

## Credits

Themes designed and implemented to enhance the NodeTool user experience with beautiful, functional color schemes for every workflow scenario.
