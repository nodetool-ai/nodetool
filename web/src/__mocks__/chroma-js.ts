const chromaMock = jest.fn((color: string) => {
  // Simulate chroma-js error handling for invalid colors
  if (color === "invalid") {
    throw new Error("unknown hex color: invalid");
  }
  
  // Handle different color inputs
  let rgbaValues;
  switch (color) {
    case "#00ff00":
    case "#0f0":
      rgbaValues = [0, 255, 0];
      break;
    case "#0000ff":
    case "blue":
      rgbaValues = [0, 0, 255];
      break;
    case "#000000":
      rgbaValues = [0, 0, 0];
      break;
    case "#ffffff":
    case "white":
      rgbaValues = [255, 255, 255];
      break;
    case "#808080":
      rgbaValues = [128, 128, 128];
      break;
    case "#e00000": // Darkened red
      rgbaValues = [224, 0, 0];
      break;
    case "#2c2c2c": // Brightened black
      rgbaValues = [44, 44, 44];
      break;
    case "#bfbfbf": // Brightened gray
      rgbaValues = [191, 191, 191];
      break;
    case "#cc3333": // Desaturated red
      rgbaValues = [204, 51, 51];
      break;
    case "rgb(255, 0, 0)":
      rgbaValues = [255, 0, 0];
      break;
    case "rgb(255, 255, 255)":
      rgbaValues = [255, 255, 255];
      break;
    case "red":
    case "#ff0000":
    case "#f00":
    default:
      rgbaValues = [255, 0, 0];
      break;
  }

  return {
    alpha: jest.fn((a: number) => ({
      rgba: jest.fn(() => [...rgbaValues, a]),
    })),
    darken: jest.fn((amount: number) => ({
      hex: jest.fn(() => {
        if (color === "#ff0000") {return "#e00000";}
        if (color === "#000000") {return "#000000";}
        if (color === "#ffffff") {
          if (amount === 1.0) {return "#cccccc";}
          if (amount === 0.1) {return "#e6e6e6";}
        }
        return "#990000";
      }),
    })),
    brighten: jest.fn((amount: number) => ({
      hex: jest.fn(() => {
        if (color === "#000000") {return "#2c2c2c";}
        if (color === "#808080") {return "#bfbfbf";}
        if (color === "#ffffff") {return "#ffffff";}
        return "#ff6666";
      }),
    })),
    set: jest.fn((prop: string, value: string) => ({
      hex: jest.fn(() => {
        if (prop === "hsl.h") {
          // Handle hue adjustments
          if (value === "+120" && color === "#ff0000") {return "#00ff00";}
          if (value === "+240" && color === "#ff0000") {return "#0000ff";}
          if (value === "+360" && color === "#ff0000") {return "#ff0000";}
          if (value === "+-120" && color === "#ff0000") {return "#0000ff";}
        }
        if (prop === "hsl.s") {
          // Handle saturation adjustments
          if (value === "*0.5" && color === "#ff0000") {return "#cc3333";} 
        }
        return "#ff0000";
      }),
    })),
    saturate: jest.fn((amount: number) => ({
      hex: jest.fn(() => "#ff0000"),
    })),
    desaturate: jest.fn((amount: number) => ({
      hex: jest.fn(() => "#cc3333"),
    })),
    hex: jest.fn(() => {
      if (color.startsWith("#")) {return color;}
      if (color === "red") {return "#ff0000";}
      if (color === "blue") {return "#0000ff";}
      if (color === "white") {return "#ffffff";}
      if (color.startsWith("rgb(")) {
        if (color === "rgb(255, 0, 0)") {return "#ff0000";}
        if (color === "rgb(255, 255, 255)") {return "#ffffff";}
      }
      return "#ff0000";
    }),
    rgba: jest.fn(() => [...rgbaValues, 1]),
  };
}) as any;

chromaMock.mix = jest.fn((color1: any, color2: any, amount: number, mode?: string) => ({
  hex: jest.fn(() => {
    // Simulate color blending for simulateOpacity tests
    if (amount === 0.5) {
      // Red + White = Light Red
      if ((color1.hex && color1.hex() === "#ffffff") && (color2.hex && color2.hex() === "#ff0000")) {return "#ff8080";}
      // White + Black = Gray  
      if ((color1.hex && color1.hex() === "#ffffff") && (color2.hex && color2.hex() === "#000000")) {return "#808080";}
      // Red + Blue = Purple
      if ((color1.hex && color1.hex() === "#ff0000") && (color2.hex && color2.hex() === "#0000ff")) {return "#800080";}
    }
    // Default case for unmatched combinations at 0.5 opacity
    if (amount === 0.5) {return "#808080";}
    if (amount === 1.0) {
      // Full opacity - return foreground color
      if (color2.hex) {return color2.hex();}
    }
    if (amount === 0) {
      // Zero opacity - return background color
      if (color1.hex) {return color1.hex();}
    }
    return "#7f7f7f";
  }),
}));

chromaMock.scale = jest.fn((colors: string[]) => ({
  mode: jest.fn((m: string) => ({
    colors: jest.fn((n: number) => {
      const result = [];
      for (let i = 0; i < n; i++) {
        result.push(`#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`);
      }
      return result;
    }),
  })),
}));

export default chromaMock;