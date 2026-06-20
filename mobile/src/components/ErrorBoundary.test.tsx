import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ErrorBoundary } from './ErrorBoundary';
import { reportError } from '../services/errorReporting';

jest.mock('../services/errorReporting', () => ({ reportError: jest.fn() }));

function Boom(): React.ReactElement {
  throw new Error('kaboom');
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Text>hello</Text>
      </ErrorBoundary>
    );
    expect(getByText('hello')).toBeTruthy();
  });

  it('renders the fallback and reports when a child throws', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(getByText('Something went wrong')).toBeTruthy();
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ source: 'ErrorBoundary' })
    );
  });
});
