import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import FloatProperty from './FloatProperty';

// Mock useTheme hook
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      text: '#FFFFFF',
      textSecondary: '#AAAAAA',
      inputBg: '#1E1E1E',
      border: '#444444',
    },
  }),
}));

describe('FloatProperty', () => {
  const mockOnChange = jest.fn();
  
  const mockDefinition = {
    data: {
      label: 'Test Float',
      description: 'This is a test float property',
    },
  };

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it('renders with label', () => {
    const { getByText } = render(
      <FloatProperty
        definition={mockDefinition}
        value={0.0}
        onChange={mockOnChange}
      />
    );

    expect(getByText('Test Float')).toBeTruthy();
  });

  it('renders with description', () => {
    const { getByText } = render(
      <FloatProperty
        definition={mockDefinition}
        value={0.0}
        onChange={mockOnChange}
      />
    );

    expect(getByText('This is a test float property')).toBeTruthy();
  });

  it('renders without description when not provided', () => {
    const definitionWithoutDesc = {
      data: {
        label: 'Test Float',
      },
    };

    const { queryByText } = render(
      <FloatProperty
        definition={definitionWithoutDesc}
        value={0.0}
        onChange={mockOnChange}
      />
    );

    expect(queryByText('This is a test float property')).toBeNull();
  });

  it('displays the float value in the input', () => {
    const { getByDisplayValue } = render(
      <FloatProperty
        definition={mockDefinition}
        value={3.14}
        onChange={mockOnChange}
      />
    );

    expect(getByDisplayValue('3.14')).toBeTruthy();
  });

  it('handles undefined value as empty string', () => {
    const { getByDisplayValue } = render(
      <FloatProperty
        definition={mockDefinition}
        value={undefined}
        onChange={mockOnChange}
      />
    );

    expect(getByDisplayValue('')).toBeTruthy();
  });

  it('calls onChange with parsed float when valid number entered', () => {
    const { getByDisplayValue } = render(
      <FloatProperty
        definition={mockDefinition}
        value={0.0}
        onChange={mockOnChange}
      />
    );

    const input = getByDisplayValue('0');
    fireEvent.changeText(input, '3.14');

    expect(mockOnChange).toHaveBeenCalledWith(3.14);
  });

  it('calls onChange with undefined when empty string entered', () => {
    const { getByDisplayValue } = render(
      <FloatProperty
        definition={mockDefinition}
        value={3.14}
        onChange={mockOnChange}
      />
    );

    const input = getByDisplayValue('3.14');
    fireEvent.changeText(input, '');

    expect(mockOnChange).toHaveBeenCalledWith(undefined);
  });

  it('calls onChange with undefined when only minus sign entered', () => {
    const { getByDisplayValue } = render(
      <FloatProperty
        definition={mockDefinition}
        value={0.0}
        onChange={mockOnChange}
      />
    );

    const input = getByDisplayValue('0');
    fireEvent.changeText(input, '-');

    expect(mockOnChange).toHaveBeenCalledWith(undefined);
  });

  it('does not call onChange when invalid text entered', () => {
    const { getByDisplayValue } = render(
      <FloatProperty
        definition={mockDefinition}
        value={0.0}
        onChange={mockOnChange}
      />
    );

    mockOnChange.mockClear();
    const input = getByDisplayValue('0');
    fireEvent.changeText(input, 'abc');

    // Should update local state but not call onChange with invalid value
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('handles negative floats', () => {
    const { getByDisplayValue } = render(
      <FloatProperty
        definition={mockDefinition}
        value={0.0}
        onChange={mockOnChange}
      />
    );

    const input = getByDisplayValue('0');
    fireEvent.changeText(input, '-2.5');

    expect(mockOnChange).toHaveBeenCalledWith(-2.5);
  });

  it('handles integer values as floats', () => {
    const { getByDisplayValue } = render(
      <FloatProperty
        definition={mockDefinition}
        value={0.0}
        onChange={mockOnChange}
      />
    );

    const input = getByDisplayValue('0');
    fireEvent.changeText(input, '42');

    expect(mockOnChange).toHaveBeenCalledWith(42);
  });

  it('input has numeric keyboard type', () => {
    const { UNSAFE_getByType } = render(
      <FloatProperty
        definition={mockDefinition}
        value={0.0}
        onChange={mockOnChange}
      />
    );

    const input = UNSAFE_getByType('TextInput');
    expect(input.props.keyboardType).toBe('numeric');
  });

  it('shows placeholder "0.0"', () => {
    const { getByPlaceholderText } = render(
      <FloatProperty
        definition={mockDefinition}
        value={undefined}
        onChange={mockOnChange}
      />
    );

    expect(getByPlaceholderText('0.0')).toBeTruthy();
  });

  it('syncs external value changes', async () => {
    const { rerender, getByDisplayValue } = render(
      <FloatProperty
        definition={mockDefinition}
        value={1.0}
        onChange={mockOnChange}
      />
    );

    expect(getByDisplayValue('1')).toBeTruthy();

    // Change external value
    rerender(
      <FloatProperty
        definition={mockDefinition}
        value={5.5}
        onChange={mockOnChange}
      />
    );

    await waitFor(() => {
      expect(getByDisplayValue('5.5')).toBeTruthy();
    });
  });
});
