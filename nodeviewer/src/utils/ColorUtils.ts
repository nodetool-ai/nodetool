/**
 * Utility functions for handling colors
 */

// Define the color mapping for different data types
export const colorForType = (type: string): string => {
  const colorMap: Record<string, string> = {
    str: "#3498db",
    int: "#2ecc71",
    float: "#1abc9c",
    bool: "#f39c12",
    list: "#9b59b6",
    dict: "#e74c3c",
    image: "#e67e22",
    audio: "#f1c40f",
    video: "#16a085",
    file: "#27ae60",
    folder: "#2980b9",
    model: "#8e44ad",
    comment: "#f5f5f5",
    default: "#95a5a6",
  };

  return colorMap[type] || colorMap.default;
};

// Helper function to darken a hex color
export const darkenHexColor = (hex: string, percent: number): string => {
  // Remove the # if present
  hex = hex.replace("#", "");

  // Parse the hex color
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Darken the color
  const darkenAmount = percent / 100;
  const dr = Math.floor(r * (1 - darkenAmount));
  const dg = Math.floor(g * (1 - darkenAmount));
  const db = Math.floor(b * (1 - darkenAmount));

  // Convert back to hex
  return `#${dr.toString(16).padStart(2, "0")}${dg
    .toString(16)
    .padStart(2, "0")}${db.toString(16).padStart(2, "0")}`;
};

// Helper function to simulate opacity
export const simulateOpacity = (
  hex: string,
  opacity: number,
  bgHex: string
): string => {
  // Remove the # if present
  hex = hex.replace("#", "");
  bgHex = bgHex.replace("#", "");

  // Parse the hex colors
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const bgR = parseInt(bgHex.substring(0, 2), 16);
  const bgG = parseInt(bgHex.substring(2, 4), 16);
  const bgB = parseInt(bgHex.substring(4, 6), 16);

  // Blend the colors
  const blendR = Math.floor(r * opacity + bgR * (1 - opacity));
  const blendG = Math.floor(g * opacity + bgG * (1 - opacity));
  const blendB = Math.floor(b * opacity + bgB * (1 - opacity));

  // Convert back to hex
  return `#${blendR.toString(16).padStart(2, "0")}${blendG
    .toString(16)
    .padStart(2, "0")}${blendB.toString(16).padStart(2, "0")}`;
};

// Helper function to convert hex to rgba
export const hexToRgba = (hex: string, alpha: number): string => {
  // Remove the # if present
  hex = hex.replace("#", "");

  // Parse the hex color
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Return rgba
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
