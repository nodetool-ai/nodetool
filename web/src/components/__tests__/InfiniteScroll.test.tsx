/**
 * Tests for InfiniteScroll component
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import InfiniteScroll from '../InfiniteScroll';

describe('InfiniteScroll', () => {
  const defaultProps = {
    next: jest.fn(),
    hasMore: true,
    loader: <div data-testid="loader">Loading...</div>,
    children: <div data-testid="content">Content</div>,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render children content', () => {
      render(<InfiniteScroll {...defaultProps} />);
      expect(screen.getByTestId('content')).toBeInTheDocument();
    });

    it('should render loader when hasMore is true', () => {
      render(<InfiniteScroll {...defaultProps} hasMore={true} />);
      expect(screen.getByTestId('loader')).toBeInTheDocument();
    });

    it('should not render loader when hasMore is false', () => {
      render(<InfiniteScroll {...defaultProps} hasMore={false} />);
      expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <InfiniteScroll {...defaultProps} className="custom-class" />
      );
      const scrollContainer = container.firstChild as HTMLElement;
      expect(scrollContainer).toHaveClass('custom-class');
    });

    it('should have proper accessibility attributes', () => {
      const { container } = render(<InfiniteScroll {...defaultProps} />);
      const scrollContainer = container.firstChild as HTMLElement;

      expect(scrollContainer).toHaveAttribute('role', 'region');
      expect(scrollContainer).toHaveAttribute('aria-label', 'Scrollable content');
      expect(scrollContainer).toHaveAttribute('aria-live', 'polite');
      expect(scrollContainer).toHaveAttribute('aria-busy', 'true');
    });

    it('should use custom aria-label when provided', () => {
      const { container } = render(
        <InfiniteScroll {...defaultProps} aria-label="Custom label" />
      );
      const scrollContainer = container.firstChild as HTMLElement;
      expect(scrollContainer).toHaveAttribute('aria-label', 'Custom label');
    });

    it('should set aria-busy to false when hasMore is false', () => {
      const { container } = render(
        <InfiniteScroll {...defaultProps} hasMore={false} />
      );
      const scrollContainer = container.firstChild as HTMLElement;
      expect(scrollContainer).toHaveAttribute('aria-busy', 'false');
    });

    it('should render loader with proper accessibility attributes', () => {
      render(<InfiniteScroll {...defaultProps} />);
      const loaderContainer = screen.getByTestId('loader').parentElement;

      expect(loaderContainer).toHaveAttribute('role', 'status');
      expect(loaderContainer).toHaveAttribute('aria-live', 'polite');
      expect(loaderContainer).toHaveAttribute('aria-label', 'Loading more items');
    });

    it('should use custom loadingLabel when provided', () => {
      render(
        <InfiniteScroll {...defaultProps} loadingLabel="Custom loading text" />
      );
      const loaderContainer = screen.getByTestId('loader').parentElement;
      expect(loaderContainer).toHaveAttribute('aria-label', 'Custom loading text');
    });
  });

  describe('Scroll Behavior', () => {
    it('calls next when scrolled near bottom', async () => {
      const next = jest.fn();
      const { container } = render(
        <InfiniteScroll next={next} hasMore loader={<div data-testid="loader">loading</div>}>
          <div data-testid="content">content</div>
        </InfiniteScroll>
      );
      const div = container.firstChild as HTMLElement;
      // Set dimensions to simulate scrolling
      Object.defineProperty(div, 'scrollTop', { value: 50, writable: true });
      Object.defineProperty(div, 'scrollHeight', { value: 200, writable: true });
      Object.defineProperty(div, 'clientHeight', { value: 100, writable: true });
      act(() => {
        div.dispatchEvent(new Event('scroll', { bubbles: true }));
      });
      await waitFor(() => expect(next).toHaveBeenCalled());
    });

    it('should not call next when hasMore is false', async () => {
      const mockNext = jest.fn();
      const { container } = render(
        <InfiniteScroll {...defaultProps} next={mockNext} hasMore={false} />
      );

      const scrollContainer = container.firstChild as HTMLElement;

      // Mock the scroll position to be near the bottom
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 900, writable: true });
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1100, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 100, writable: true });

      // Trigger scroll event
      act(() => {
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
      });

      // Wait a bit to ensure no call was made
      await waitFor(
        () => {
          expect(mockNext).not.toHaveBeenCalled();
        },
        { timeout: 100 }
      );
    });

    it('should not call next when not near bottom threshold', async () => {
      const mockNext = jest.fn();
      const { container } = render(
        <InfiniteScroll {...defaultProps} next={mockNext} threshold={100} />
      );

      const scrollContainer = container.firstChild as HTMLElement;

      // Mock the scroll position to be far from bottom (more than threshold)
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 500, writable: true });
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1100, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 100, writable: true });

      // Trigger scroll event
      act(() => {
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
      });

      // Wait a bit to ensure no call was made
      await waitFor(
        () => {
          expect(mockNext).not.toHaveBeenCalled();
        },
        { timeout: 100 }
      );
    });

    it('should use custom threshold when provided', async () => {
      const mockNext = jest.fn();
      const { container } = render(
        <InfiniteScroll {...defaultProps} next={mockNext} threshold={200} />
      );

      const scrollContainer = container.firstChild as HTMLElement;

      // Mock the scroll position to be within custom threshold
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 801, writable: true });
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1100, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 100, writable: true });

      // Trigger scroll event
      act(() => {
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
      });

      await waitFor(() => {
        expect(mockNext).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle async next function correctly', async () => {
      const mockNext = jest.fn(() => Promise.resolve());
      const { container } = render(
        <InfiniteScroll {...defaultProps} next={mockNext} />
      );

      const scrollContainer = container.firstChild as HTMLElement;

      // Mock the scroll position to be near the bottom (remaining = 1100 - 900 - 100 = 100 < 100 threshold)
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 901, writable: true });
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1100, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 100, writable: true });

      // Trigger scroll event
      act(() => {
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
      });

      await waitFor(() => {
        expect(mockNext).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Component Lifecycle', () => {
    it('should clean up event listener on unmount', () => {
      const removeEventListenerSpy = jest.spyOn(
        HTMLDivElement.prototype,
        'removeEventListener'
      );

      const { unmount } = render(<InfiniteScroll {...defaultProps} />);

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'scroll',
        expect.any(Function)
      );

      removeEventListenerSpy.mockRestore();
    });

    it('should add passive event listener for better performance', () => {
      const addEventListenerSpy = jest.spyOn(
        HTMLDivElement.prototype,
        'addEventListener'
      );

      render(<InfiniteScroll {...defaultProps} />);

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'scroll',
        expect.any(Function),
        expect.objectContaining({ passive: true })
      );

      addEventListenerSpy.mockRestore();
    });
  });

  describe('Race Condition Prevention', () => {
    it('should use requestAnimationFrame for scroll handling', () => {
      const rafSpy = jest.spyOn(window, 'requestAnimationFrame');

      const { container } = render(
        <InfiniteScroll {...defaultProps} next={jest.fn()} />
      );

      const scrollContainer = container.firstChild as HTMLElement;

      // Trigger scroll event
      act(() => {
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
      });

      // Should have called requestAnimationFrame
      expect(rafSpy).toHaveBeenCalled();

      rafSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty children', () => {
      const { container } = render(
        <InfiniteScroll {...defaultProps}>
          {null}
        </InfiniteScroll>
      );
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should handle null loader', () => {
      const { container } = render(
        <InfiniteScroll {...defaultProps} loader={null} hasMore={true} />
      );
      // Should render without crashing
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('Display Name', () => {
    it('should have correct display name', () => {
      expect(InfiniteScroll.displayName).toBe('InfiniteScroll');
    });
  });
});
