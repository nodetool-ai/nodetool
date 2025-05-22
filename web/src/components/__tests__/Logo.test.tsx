import React from 'react';
import { render, screen } from '@testing-library/react';

// Mock theme to avoid font imports
jest.mock('../themes/ThemeNodetool', () => ({
  __esModule: true,
  default: { palette: { c_white: '#fff' }, fontFamily1: 'monospace' },
}));

// Mock data types to avoid svg imports
jest.mock('../../config/data_types', () => ({
  __esModule: true,
  DATA_TYPES: [{ color: '#000', textColor: '#fff' }],
}));

import Logo from '../Logo';

jest.spyOn(global.Math, 'random').mockReturnValue(0);

afterAll(() => {
  (Math.random as jest.Mock).mockRestore();
});

describe('Logo', () => {
  it('renders image when small is true', () => {
    render(
      <Logo width="20px" height="20px" fontSize="10px" borderRadius="0" small enableText />
    );
    expect(screen.getByAltText('NodeTool')).toBeInTheDocument();
  });

  it('renders text when enableText is true', () => {
    render(
      <Logo width="20px" height="20px" fontSize="10px" borderRadius="0" small={false} enableText />
    );
    const text = screen.getByText(/NODE/);
    expect(text).toBeInTheDocument();
  });
});
