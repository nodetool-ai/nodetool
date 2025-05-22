import React from 'react';
import { render } from '@testing-library/react';
import { KeyboardProvider } from '../KeyboardProvider';

jest.mock('../../stores/KeyPressedStore', () => ({
  initKeyListeners: jest.fn(() => jest.fn()),
}));

import { initKeyListeners } from '../../stores/KeyPressedStore';

describe('KeyboardProvider', () => {
  it('initializes key listeners when active', () => {
    render(
      <KeyboardProvider>
        <div data-testid="child" />
      </KeyboardProvider>
    );
    expect(initKeyListeners).toHaveBeenCalledTimes(1);
  });

  it('does not initialize listeners when inactive', () => {
    (initKeyListeners as jest.Mock).mockClear();
    render(
      <KeyboardProvider active={false}>
        <div data-testid="child" />
      </KeyboardProvider>
    );
    expect(initKeyListeners).not.toHaveBeenCalled();
  });
});
