import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import IntegerProperty from './IntegerProperty';

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

describe('IntegerProperty', () => {
  const mockOnChange = jest.fn();
  
  const mockDefinition = {
    data: {
      label: 'Test Integer',
      description: 'This is a test integer property',
    },
  };

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it('renders with label', () => {
    const { getByText } = render(
      <IntegerProperty
        definition={mockDefinition}
        value={0}
        onChange={mockOnChange}
      />
    );

    expect(getByText('Test Integer')).toBeTruthy();
  });

  it('renders with description', () => {
    const { getByText } = render(
      <IntegerProperty
        definition={mockDefinition}
        value={0}
        onChange={mockOnChange}
      />
    );

    expect(getByText('This is a test integer property')).toBeTruthy();
  });

  it('renders without description when not provided', () => {
    const definitionWithoutDesc = {
      data: {
        label: 'Test Integer',
      },
    };

    const { queryByText } = render(
      <IntegerProperty
        definition={definitionWithoutDesc}
        value={0}
        onChange={mockOnChange}
      />
    );

    expect(queryByText('This is a test integer property')).toBeNull();
  });

  it('displays the integer value in the input', () => {
    const { getByDisplayValue } = render(
      <IntegerProperty
        definition={mockDefinition}
        value={42}
        onChange={mockOnChange}
      />
    );

    expect(getByDisplayValue('42')).toBeTruthy();
  });

  it('handles undefined value as empty string', () => {
    const { getByDisplayValue } = render(
      <IntegerProperty
        definition={mockDefinition}
        value={undefined}
        onChange={mockOnChange}
      />
    );

    expect(getByDisplayValue('')).toBeTruthy();
  });

  it('calls onChange with parsed integer when valid number entered', () => {
    const { getByDisplayValue } = render(
      <IntegerProperty
        definition={mockDefinition}
        value={0}
        onChange={mockOnChange}
      />
    );

    const input = getByDisplayValue('0');
    fireEvent.changeText(input, '123');

    expect(mockOnChange).toHaveBeenCalledWith(123);
  });

  it('calls onChange with undefined when empty string entered', () => {
    const { getByDisplayValue } = render(
      <IntegerProperty
        definition={mockDefinition}
        value={42}
        onChange={mockOnChange}
      />
    );

    const input = getByDisplayValue('42');
    fireEvent.changeText(input, '');

    expect(mockOnChange).toHaveBeenCalledWith(undefined);
  });

  it('calls onChange with undefined when invalid text entered', () => {
    const { getByDisplayValue } = render(
      <IntegerProperty
        definition={mockDefinition}
        value={0}
        onChange={mockOnChange}
      />
    );

    const input = getByDisplayValue('0');
    fireEvent.changeText(input, 'abc');

    expect(mockOnChange).toHaveBeenCalledWith(undefined);
  });

  it('handles negative integers', () => {
    const { getByDisplayValue } = render(
      <IntegerProperty
        definition={mockDefinition}
        value={0}
        onChange={mockOnChange}
      />
    );

    const input = getByDisplayValue('0');
    fireEvent.changeText(input, '-42');

    expect(mockOnChange).toHaveBeenCalledWith(-42);
  });

  it('input has numeric keyboard type', () => {
    const { UNSAFE_getByType } = render(
      <IntegerProperty
        definition={mockDefinition}
        value={0}
        onChange={mockOnChange}
      />
    );

    const input = UNSAFE_getByType('TextInput');
    expect(input.props.keyboardType).toBe('numeric');
  });

  it('shows placeholder "0"', () => {
    const { getByPlaceholderText } = render(
      <IntegerProperty
        definition={mockDefinition}
        value={undefined}
        onChange={mockOnChange}
      />
    );

    expect(getByPlaceholderText('0')).toBeTruthy();
  });
});
