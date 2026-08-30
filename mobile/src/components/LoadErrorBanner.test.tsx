import { render, screen } from '@testing-library/react-native';

import { LoadErrorBanner } from './LoadErrorBanner';

describe('LoadErrorBanner', () => {
  it('shows nothing when the load succeeded', () => {
    render(<LoadErrorBanner error={null} />);
    expect(screen.toJSON()).toBeNull();
  });

  it('shows the failure message', () => {
    render(<LoadErrorBanner error="Failed to load jobs" />);
    expect(screen.getByText('Failed to load jobs')).toBeTruthy();
  });

  it('lets a long message shrink instead of overflowing the centred row', () => {
    render(<LoadErrorBanner error="a very long failure message" />);
    expect(screen.getByText('a very long failure message').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ flexShrink: 1 })])
    );
  });
});
