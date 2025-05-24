import React from 'react';
import { render } from '@testing-library/react';
import { act } from 'react-dom/test-utils';
import LoadingAnimation from '../LoadingAnimation';

jest.useFakeTimers();

describe('LoadingAnimation', () => {
  it('changes gradient over time', () => {
    jest.spyOn(global.Math, 'random').mockReturnValue(0.5);
    const { container } = render(<LoadingAnimation />);
    const gradient = container.querySelector('.loading-gradient') as HTMLElement;
    const initialClass = gradient.className;
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(gradient.className).not.toBe(initialClass);
    (Math.random as jest.Mock).mockRestore();
  });
});
