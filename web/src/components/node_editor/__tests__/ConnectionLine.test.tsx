import React from 'react';
import { render } from '@testing-library/react';
import ConnectionLine from '../ConnectionLine';
import useConnectionStore from '../../../stores/ConnectionStore';
import { ConnectionLineType } from '@xyflow/react';

jest.mock('../../../stores/ConnectionStore');

jest.mock('@xyflow/react', () => ({
  ConnectionLineType: {
    Bezier: 'bezier',
    Step: 'step',
    SmoothStep: 'smoothstep',
    SimpleBezier: 'simplebezier'
  },
  getBezierPath: jest.fn(() => ['M-bezier']),
  getSmoothStepPath: jest.fn(() => ['M-smooth']),
  getSimpleBezierPath: jest.fn(() => ['M-simple'])
}));

(useConnectionStore as unknown as jest.Mock).mockImplementation((sel: any) =>
  sel({ connectType: { type: 'my-type' } })
);

describe('ConnectionLine', () => {
  it('renders bezier path and class', () => {
    const { container } = render(
      <ConnectionLine
        {...({
          fromX: 0,
          fromY: 0,
          toX: 10,
          toY: 10,
          fromPosition: 'left',
          toPosition: 'right',
          connectionLineType: ConnectionLineType.Bezier,
        } as any)}
      />
    );
    const path = container.querySelector('path');
    expect(path?.getAttribute('d')).toBe('M-bezier');
    expect(path).toHaveClass('my_type');
    const rect = container.querySelector('rect');
    expect(rect).toBeInTheDocument();
  });
});
