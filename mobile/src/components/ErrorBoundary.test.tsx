import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ErrorBoundary, withScreenBoundary } from './ErrorBoundary';
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

  it('recovers when "Try again" re-renders a child that no longer throws', () => {
    let shouldThrow = true;
    function Flaky(): React.ReactElement {
      if (shouldThrow) {
        throw new Error('first render fails');
      }
      return <Text>recovered</Text>;
    }
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>
    );
    shouldThrow = false;
    fireEvent.press(screen.getByLabelText('Try again'));
    expect(screen.getByText('recovered')).toBeTruthy();
  });

  it('gives a crashing screen a way back instead of a dead end', () => {
    const goBack = jest.fn();
    const Screen = withScreenBoundary(
      (_props: { navigation: { canGoBack: () => boolean; goBack: () => void } }) => <Boom />,
      'Boom'
    );
    render(<Screen navigation={{ canGoBack: () => true, goBack }} />);

    fireEvent.press(screen.getByLabelText('Go back'));
    expect(goBack).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ extra: expect.objectContaining({ boundary: 'Boom' }) })
    );
  });

  it('offers no way back on the first screen of the stack', () => {
    const Screen = withScreenBoundary(
      (_props: { navigation: { canGoBack: () => boolean; goBack: () => void } }) => <Boom />,
      'Root'
    );
    render(<Screen navigation={{ canGoBack: () => false, goBack: jest.fn() }} />);
    expect(screen.queryByLabelText('Go back')).toBeNull();
    expect(screen.getByLabelText('Try again')).toBeTruthy();
  });
});
