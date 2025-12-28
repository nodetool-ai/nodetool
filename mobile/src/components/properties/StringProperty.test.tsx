import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import StringProperty from './StringProperty';

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

describe('StringProperty', () => {
  const mockOnChange = jest.fn();
  
  const mockDefinition = {
    nodeId: 'test-node',
    nodeType: 'nodetool.input.StringInput',
    kind: 'string' as const,
    data: {
      name: 'testString',
      label: 'Test String',
      description: 'This is a test string property',
    },
  };

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it('renders with label', () => {
    const { getByText } = render(
      <StringProperty
        definition={mockDefinition}
        value=""
        onChange={mockOnChange}
      />
    );

    expect(getByText('Test String')).toBeTruthy();
  });

  it('renders with description', () => {
    const { getByText } = render(
      <StringProperty
        definition={mockDefinition}
        value=""
        onChange={mockOnChange}
      />
    );

    expect(getByText('This is a test string property')).toBeTruthy();
  });

  it('renders without description when not provided', () => {
    const definitionWithoutDesc = {
      nodeId: 'test-node',
      nodeType: 'nodetool.input.StringInput',
      kind: 'string' as const,
      data: {
        name: 'testString',
        label: 'Test String',
      },
    };

    const { queryByText } = render(
      <StringProperty
        definition={definitionWithoutDesc}
        value=""
        onChange={mockOnChange}
      />
    );

    expect(queryByText('This is a test string property')).toBeNull();
  });

  it('displays the value in the input', () => {
    const { getByDisplayValue } = render(
      <StringProperty
        definition={mockDefinition}
        value="Hello World"
        onChange={mockOnChange}
      />
    );

    expect(getByDisplayValue('Hello World')).toBeTruthy();
  });

  it('handles undefined value as empty string', () => {
    const { getByDisplayValue } = render(
      <StringProperty
        definition={mockDefinition}
        value={undefined}
        onChange={mockOnChange}
      />
    );

    expect(getByDisplayValue('')).toBeTruthy();
  });

  it('calls onChange when text is entered', () => {
    const { getByDisplayValue } = render(
      <StringProperty
        definition={mockDefinition}
        value=""
        onChange={mockOnChange}
      />
    );

    const input = getByDisplayValue('');
    fireEvent.changeText(input, 'New Text');

    expect(mockOnChange).toHaveBeenCalledWith('New Text');
  });

  it('shows placeholder with lowercase label', () => {
    const { getByPlaceholderText } = render(
      <StringProperty
        definition={mockDefinition}
        value=""
        onChange={mockOnChange}
      />
    );

    expect(getByPlaceholderText('Enter test string')).toBeTruthy();
  });

  it('shows default placeholder when label is missing', () => {
    const definitionWithoutLabel = {
      nodeId: 'test-node',
      nodeType: 'nodetool.input.StringInput',
      kind: 'string' as const,
      data: {
        name: 'testString',
      },
    };

    const { getByPlaceholderText } = render(
      <StringProperty
        definition={definitionWithoutLabel}
        value=""
        onChange={mockOnChange}
      />
    );

    expect(getByPlaceholderText('Enter text')).toBeTruthy();
  });

  it('input is multiline', () => {
    const { UNSAFE_getByType } = render(
      <StringProperty
        definition={mockDefinition}
        value=""
        onChange={mockOnChange}
      />
    );

    const input = UNSAFE_getByType('TextInput' as any);
    expect(input.props.multiline).toBe(true);
  });
});
