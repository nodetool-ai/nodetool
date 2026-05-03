/**
 * Tests for HandleTooltip component accessibility features
 */

import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { HandleTooltip } from '../HandleTooltip';
import { TypeMetadata } from '../../stores/ApiTypes';
import useConnectionStore from '../../stores/ConnectionStore';

// Mock the dependencies
jest.mock('../../utils/MousePosition', () => ({
  getMousePosition: jest.fn(() => ({ x: 100, y: 100 }))
}));

jest.mock('../../config/data_types', () => ({
  colorForType: jest.fn(() => '#ff0000'),
  textColorForType: jest.fn(() => '#ffffff')
}));

jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (node: React.ReactNode) => node
}));

jest.mock('../../stores/ConnectionStore');

const mockUseConnectionStore = useConnectionStore as unknown as jest.Mock;

describe('HandleTooltip', () => {
  const createMockTypeMetadata = (type: string): TypeMetadata => ({
    type,
    optional: false,
    type_args: []
  });

  const defaultProps = {
    typeMetadata: createMockTypeMetadata('string'),
    paramName: 'test_param',
    handlePosition: 'right' as const,
    children: <div data-testid="test-child">Test Handle</div>
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseConnectionStore.mockImplementation((selector: (state: { connecting: boolean; isReconnecting: boolean }) => unknown) =>
      selector({ connecting: false, isReconnecting: false })
    );
  });

  describe('Accessibility Attributes', () => {
    it('should have proper ARIA attributes on wrapper', () => {
      render(<HandleTooltip {...defaultProps} />);

      const wrapper = screen.getByRole('button');
      expect(wrapper).toBeInTheDocument();
      expect(wrapper).toHaveAttribute('aria-label', 'Test Param (string)');
      expect(wrapper).toHaveAttribute('tabIndex', '0');
    });

    it('should not have aria-describedby when tooltip is not shown', () => {
      render(<HandleTooltip {...defaultProps} />);

      const wrapper = screen.getByRole('button');
      expect(wrapper).not.toHaveAttribute('aria-describedby');
    });

    it('should have aria-describedby pointing to tooltip when shown', async () => {
      render(<HandleTooltip {...defaultProps} />);

      const wrapper = screen.getByRole('button');

      // Focus the element to show tooltip immediately
      await act(async () => {
        wrapper.focus();
      });

      await waitFor(() => {
        expect(wrapper).toHaveAttribute('aria-describedby');
        const describedby = wrapper.getAttribute('aria-describedby');
        expect(describedby).toMatch(/^handle-tooltip-\d+$/);
      });
    });

    it('should have role="tooltip" on tooltip content', async () => {
      render(<HandleTooltip {...defaultProps} />);

      const wrapper = screen.getByRole('button');

      await act(async () => {
        wrapper.focus();
      });

      await waitFor(() => {
        const tooltip = document.querySelector('[role="tooltip"]');
        expect(tooltip).toBeInTheDocument();
      });
    });

    it('should have aria-live="polite" on tooltip for screen readers', async () => {
      render(<HandleTooltip {...defaultProps} />);

      const wrapper = screen.getByRole('button');

      await act(async () => {
        wrapper.focus();
      });

      await waitFor(() => {
        const tooltip = document.querySelector('[role="tooltip"]');
        expect(tooltip).toHaveAttribute('aria-live', 'polite');
      });
    });
  });

  describe('Keyboard Navigation', () => {
    it('should show tooltip on focus', async () => {
      render(<HandleTooltip {...defaultProps} />);

      const wrapper = screen.getByRole('button');

      await act(async () => {
        wrapper.focus();
      });

      await waitFor(() => {
        expect(wrapper).toHaveAttribute('aria-describedby');
        const tooltip = document.querySelector('[role="tooltip"]');
        expect(tooltip).toBeInTheDocument();
      });
    });

    it('should hide tooltip on blur', async () => {
      render(<HandleTooltip {...defaultProps} />);

      const wrapper = screen.getByRole('button');

      await act(async () => {
        wrapper.focus();
      });

      await waitFor(() => {
        expect(wrapper).toHaveAttribute('aria-describedby');
      });

      await act(async () => {
        wrapper.blur();
      });

      await waitFor(() => {
        expect(wrapper).not.toHaveAttribute('aria-describedby');
      });
    });

    it('should be keyboard focusable', () => {
      render(<HandleTooltip {...defaultProps} />);

      const wrapper = screen.getByRole('button');
      expect(wrapper).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('Mouse Interactions', () => {
    it('should handle mouse enter event', () => {
      render(<HandleTooltip {...defaultProps} />);

      const wrapper = screen.getByTestId('test-child').parentElement;

      expect(() => {
        wrapper?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      }).not.toThrow();
    });

    it('should handle mouse leave event', () => {
      render(<HandleTooltip {...defaultProps} />);

      const wrapper = screen.getByTestId('test-child').parentElement;

      expect(() => {
        wrapper?.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      }).not.toThrow();
    });

    it('should handle rapid mouse enter and leave events', () => {
      jest.useFakeTimers();

      render(<HandleTooltip {...defaultProps} />);

      const wrapper = screen.getByTestId('test-child').parentElement;

      act(() => {
        wrapper?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        wrapper?.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
      });

      act(() => {
        jest.advanceTimersByTime(700);
      });

      // Should not throw even with rapid events
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();

      jest.useRealTimers();
    });

    it('should wait longer before showing on hover', () => {
      jest.useFakeTimers();

      render(<HandleTooltip {...defaultProps} />);

      const wrapper = screen.getByRole('button');

      act(() => {
        fireEvent.mouseEnter(wrapper);
      });

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(document.querySelector('[role="tooltip"]')).not.toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(200);
      });

      expect(document.querySelector('[role="tooltip"]')).toBeInTheDocument();

      jest.useRealTimers();
    });

    it('should not show tooltip while a connection drag is active', () => {
      jest.useFakeTimers();
      mockUseConnectionStore.mockImplementation((selector: (state: { connecting: boolean; isReconnecting: boolean }) => unknown) =>
        selector({ connecting: true, isReconnecting: false })
      );

      render(<HandleTooltip {...defaultProps} />);

      const wrapper = screen.getByRole('button');

      act(() => {
        fireEvent.mouseEnter(wrapper);
        jest.advanceTimersByTime(1500);
      });

      expect(document.querySelector('[role="tooltip"]')).not.toBeInTheDocument();

      jest.useRealTimers();
    });
  });

  describe('Type Formatting', () => {
    it('should format parameter name as title case', () => {
      render(<HandleTooltip {...defaultProps} paramName="my_test_param" />);

      const wrapper = screen.getByRole('button');
      expect(wrapper).toHaveAttribute('aria-label', 'My Test Param (string)');
    });

    it('should handle union types (float|int) as "number"', () => {
      const unionType: TypeMetadata = {
        type: 'union',
        optional: false,
        type_args: [
          { type: 'float', optional: false, type_args: [] },
          { type: 'int', optional: false, type_args: [] }
        ]
      };

      render(<HandleTooltip {...defaultProps} typeMetadata={unionType} />);

      const wrapper = screen.getByRole('button');
      expect(wrapper).toHaveAttribute('aria-label', 'Test Param (number)');
    });

    it('should handle union types in reverse order (int|float)', () => {
      const unionType: TypeMetadata = {
        type: 'union',
        optional: false,
        type_args: [
          { type: 'int', optional: false, type_args: [] },
          { type: 'float', optional: false, type_args: [] }
        ]
      };

      render(<HandleTooltip {...defaultProps} typeMetadata={unionType} />);

      const wrapper = screen.getByRole('button');
      expect(wrapper).toHaveAttribute('aria-label', 'Test Param (number)');
    });
  });

  describe('Tooltip Content', () => {
    it('should display streaming output info when flag is set', async () => {
      const props = { ...defaultProps, isStreamingOutput: true };

      render(<HandleTooltip {...props} />);

      const wrapper = screen.getByRole('button');

      await act(async () => {
        wrapper.focus();
      });

      await waitFor(() => {
        const tooltipInfo = document.querySelector('.handle-tooltip-info');
        expect(tooltipInfo).toHaveTextContent('Streaming output - emits values continuously during execution');
      });
    });

    it('should display collect input info when flag is set', async () => {
      const props = { ...defaultProps, isCollectInput: true };

      render(<HandleTooltip {...props} />);

      const wrapper = screen.getByRole('button');

      await act(async () => {
        wrapper.focus();
      });

      await waitFor(() => {
        const tooltipInfo = document.querySelector('.handle-tooltip-info');
        expect(tooltipInfo).toHaveTextContent('Collect input - accepts multiple connections that are combined into a list');
      });
    });

    it('should display parameter name and type in tooltip', async () => {
      render(<HandleTooltip {...defaultProps} />);

      const wrapper = screen.getByRole('button');

      await act(async () => {
        wrapper.focus();
      });

      await waitFor(() => {
        const tooltipName = document.querySelector('.handle-tooltip-name');
        const tooltipType = document.querySelector('.handle-tooltip-type');
        expect(tooltipName).toHaveTextContent('Test Param');
        expect(tooltipType).toHaveTextContent('string');
      });
    });
  });

  describe('Handle Position', () => {
    it('should accept "left" handle position', () => {
      render(<HandleTooltip {...defaultProps} handlePosition="left" />);

      const wrapper = screen.getByRole('button');
      expect(wrapper).toBeInTheDocument();
    });

    it('should accept "right" handle position', () => {
      render(<HandleTooltip {...defaultProps} handlePosition="right" />);

      const wrapper = screen.getByRole('button');
      expect(wrapper).toBeInTheDocument();
    });
  });

  describe('Custom className', () => {
    it('should apply custom className to wrapper', () => {
      render(<HandleTooltip {...defaultProps} className="custom-class" />);

      const wrapper = screen.getByRole('button');
      expect(wrapper).toHaveClass('custom-class');
    });
  });

  describe('Cleanup', () => {
    it('should clean up timers on unmount', () => {
      const { unmount } = render(<HandleTooltip {...defaultProps} />);

      const wrapper = screen.getByTestId('test-child').parentElement;

      act(() => {
        wrapper?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      });

      // Unmount should clear any pending timers
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty paramName', () => {
      render(<HandleTooltip {...defaultProps} paramName="" />);

      const wrapper = screen.getByRole('button');
      expect(wrapper).toBeInTheDocument();
    });

    it('should handle paramName with multiple underscores', () => {
      render(<HandleTooltip {...defaultProps} paramName="very_long_test_param_name" />);

      const wrapper = screen.getByRole('button');
      expect(wrapper).toHaveAttribute('aria-label', 'Very Long Test Param Name (string)');
    });

    it('should handle paramName with single word', () => {
      render(<HandleTooltip {...defaultProps} paramName="name" />);

      const wrapper = screen.getByRole('button');
      expect(wrapper).toHaveAttribute('aria-label', 'Name (string)');
    });
  });
});
