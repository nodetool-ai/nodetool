const chromaMock = jest.fn((color: string) => ({
  alpha: jest.fn((a: number) => ({
    rgba: jest.fn(() => [255, 0, 0, a]),
  })),
  darken: jest.fn((amount: number) => ({
    hex: jest.fn(() => "#990000"),
  })),
  brighten: jest.fn((amount: number) => ({
    hex: jest.fn(() => "#ff6666"),
  })),
  saturate: jest.fn((amount: number) => ({
    hex: jest.fn(() => "#ff0000"),
  })),
  desaturate: jest.fn((amount: number) => ({
    hex: jest.fn(() => "#cc3333"),
  })),
  hex: jest.fn(() => "#ff0000"),
  rgba: jest.fn(() => [255, 0, 0, 1]),
}));

chromaMock.mix = jest.fn((color1: any, color2: any, amount: number, mode?: string) => ({
  hex: jest.fn(() => "#7f7f7f"),
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