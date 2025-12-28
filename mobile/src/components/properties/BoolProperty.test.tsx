import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import BoolProperty from './BoolProperty';

// Mock useTheme hook
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      text: '#FFFFFF',
      textSecondary: '#AAAAAA',
      inputBg: '#1E1E1E',
      border: '#444444',
      primary: '#007AFF',
    },
  }),
}));

describe('BoolProperty', () => {
  const mockOnChange = jest.fn();
  
  const mockDefinition = {
    nodeId: 'test-node',
    nodeType: 'nodetool.input.BooleanInput',
    kind: 'boolean' as const,
    data: {
      name: 'testBoolean',
      label: 'Test Boolean',
      description: 'This is a test boolean property',
    },
  };

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it('renders with label', () => {
    const { getByText } = render(
      <BoolProperty
        definition={mockDefinition}
        value={false}
        onChange={mockOnChange}
      />
    );

    expect(getByText('Test Boolean')).toBeTruthy();
  });

  it('renders with description', () => {
    const { getByText } = render(
      <BoolProperty
        definition={mockDefinition}
        value={false}
        onChange={mockOnChange}
      />
    );

    expect(getByText('This is a test boolean property')).toBeTruthy();
  });

  it('renders without description when not provided', () => {
    const definitionWithoutDesc = {
      nodeId: 'test-node',
      nodeType: 'nodetool.input.BooleanInput',
      kind: 'boolean' as const,
      data: {
        name: 'testBoolean',
        label: 'Test Boolean',
      },
    };

    const { queryByText } = render(
      <BoolProperty
        definition={definitionWithoutDesc}
        value={false}
        onChange={mockOnChange}
      />
    );

    expect(queryByText('This is a test boolean property')).toBeNull();
  });

  it('displays switch as unchecked when value is false', () => {
    const { UNSAFE_getByType } = render(
      <BoolProperty
        definition={mockDefinition}
        value={false}
        onChange={mockOnChange}
      />
    );

    const switchComponent = UNSAFE_getByType('RCTSwitch' as any);
    expect(switchComponent.props.value).toBe(false);
  });

  it('displays switch as checked when value is true', () => {
    const { UNSAFE_getByType } = render(
      <BoolProperty
        definition={mockDefinition}
        value={true}
        onChange={mockOnChange}
      />
    );

    const switchComponent = UNSAFE_getByType('RCTSwitch' as any);
    expect(switchComponent.props.value).toBe(true);
  });

  it('handles undefined value as false', () => {
    const { UNSAFE_getByType } = render(
      <BoolProperty
        definition={mockDefinition}
        value={undefined}
        onChange={mockOnChange}
      />
    );

    const switchComponent = UNSAFE_getByType('RCTSwitch' as any);
    expect(switchComponent.props.value).toBe(false);
  });

  it('calls onChange when switch is toggled', () => {
    const { UNSAFE_getByType } = render(
      <BoolProperty
        definition={mockDefinition}
        value={false}
        onChange={mockOnChange}
      />
    );

    const switchComponent = UNSAFE_getByType('RCTSwitch' as any);
    fireEvent(switchComponent, 'onValueChange', true);

    expect(mockOnChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when switch is turned off', () => {
    const { UNSAFE_getByType } = render(
      <BoolProperty
        definition={mockDefinition}
        value={true}
        onChange={mockOnChange}
      />
    );

    const switchComponent = UNSAFE_getByType('RCTSwitch' as any);
    fireEvent(switchComponent, 'onValueChange', false);

    expect(mockOnChange).toHaveBeenCalledWith(false);
  });
});
