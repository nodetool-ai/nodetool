import { fireEvent, render, screen } from '@testing-library/react-native';

import { describeLoadError, EmptyState, ErrorState, LoadingState, OfflineState } from './ScreenState';

describe('ScreenState', () => {
  it('names what is loading for screen readers', () => {
    render(<LoadingState label="Loading jobs" />);
    expect(screen.getByLabelText('Loading jobs')).toBeTruthy();
    expect(screen.getByText('Loading jobs')).toBeTruthy();
  });

  it('shows an empty state with its call to action', () => {
    const onPress = jest.fn();
    render(
      <EmptyState
        icon="apps-outline"
        title="No apps yet"
        message="Build one."
        action={{ label: 'Ask the assistant', onPress }}
      />
    );
    expect(screen.getByText('No apps yet')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Ask the assistant'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('offers retry and a second way out on an error', () => {
    const onRetry = jest.fn();
    const onBack = jest.fn();
    render(
      <ErrorState
        title="Couldn't load jobs"
        message="Server returned 500"
        onRetry={onRetry}
        secondaryAction={{ label: 'Go back', onPress: onBack }}
      />
    );
    expect(screen.getByText('Server returned 500')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Try again'));
    fireEvent.press(screen.getByLabelText('Go back'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('omits the retry button when there is nothing to retry', () => {
    render(<ErrorState message="broken" />);
    expect(screen.queryByLabelText('Try again')).toBeNull();
  });

  it('explains an uncached screen while offline instead of calling it missing', () => {
    render(<OfflineState onRetry={jest.fn()} />);
    expect(screen.getByText("You're offline")).toBeTruthy();
  });

  it('rewrites transport errors into an actionable sentence and keeps server messages', () => {
    expect(describeLoadError('Failed to fetch')).toMatch(/Can't reach the server/);
    expect(describeLoadError('Network request failed')).toMatch(/Can't reach the server/);
    expect(describeLoadError('Request timed out after 30000ms')).toMatch(/Can't reach the server/);
    expect(describeLoadError('Workflow not found')).toBe('Workflow not found');
    expect(describeLoadError(null)).toBeNull();
  });
});
