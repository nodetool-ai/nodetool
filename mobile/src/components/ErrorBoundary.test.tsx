import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ErrorBoundary } from './ErrorBoundary';
import {
  __resetErrorReportingForTests,
  setErrorReporter,
} from '../services/errorReporting';

// The reporting module already exposes an injection seam, so the boundary runs
// against the real `reportError` (Error coercion, sink routing) and only the
// terminal sink is a double.
const captureException = jest.fn();

beforeEach(() => {
  __resetErrorReportingForTests();
  captureException.mockClear();
  setErrorReporter({ captureException });
});

afterEach(() => {
  __resetErrorReportingForTests();
});

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
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ source: 'ErrorBoundary' })
    );
  });
});
