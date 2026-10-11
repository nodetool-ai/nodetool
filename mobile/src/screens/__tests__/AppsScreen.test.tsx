/**
 * The home tab after login: the app list, plus the settings gear in the
 * header. The tab bar reaches the companion's other surfaces.
 */
import React from 'react';
import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockRefetch = jest.fn();
let mockApplications: {
  data: { id: string; name: string; operationCount: number; updatedAt: string }[];
  error: Error | null;
} = { data: [], error: null };

jest.mock('../../hooks/useApplications', () => ({
  useApplications: () => ({
    data: mockApplications.data,
    isLoading: false,
    isRefetching: false,
    error: mockApplications.error,
    refetch: mockRefetch,
  }),
}));

beforeEach(() => {
  mockApplications = { data: [], error: null };
  mockRefetch.mockClear();
});

import AppsScreen from '../AppsScreen';

type HeaderRight = () => React.ReactElement;

describe('AppsScreen', () => {
  it('opens settings from the header', async () => {
    const navigate = jest.fn();
    let headerRight: HeaderRight | undefined;
    const navigation = {
      navigate,
      setOptions: (options: { headerRight?: HeaderRight }) => {
        headerRight = options.headerRight;
      },
    };

    render(
      <AppsScreen
        navigation={navigation as unknown as React.ComponentProps<typeof AppsScreen>['navigation']}
      />
    );
    expect(headerRight).toBeDefined();
    render(headerRight!());

    const user = userEvent.setup();
    await user.press(screen.getByLabelText('Open settings'));
    expect(navigate).toHaveBeenLastCalledWith('Settings');
  });

  it('gives each app a monogram tile and counts the list', () => {
    mockApplications = {
      data: [
        { id: 'a1', name: 'Logo maker', operationCount: 2, updatedAt: new Date().toISOString() },
        { id: 'a2', name: 'Fox', operationCount: 1, updatedAt: new Date().toISOString() },
      ],
      error: null,
    };
    renderScreen();
    expect(screen.getByText('2 apps')).toBeTruthy();
    expect(screen.getByText('LM')).toBeTruthy();
    expect(screen.getByText('F')).toBeTruthy();
  });

  function renderScreen(navigate = jest.fn()) {
    const navigation = { navigate, setOptions: jest.fn() };
    render(
      <AppsScreen
        navigation={navigation as unknown as React.ComponentProps<typeof AppsScreen>['navigation']}
      />
    );
    return navigate;
  }

  it('shows a retryable error instead of "No apps yet" when the first load fails', () => {
    mockApplications = { data: [], error: new Error('Network request failed') };
    const navigate = renderScreen();

    expect(screen.queryByText('No apps yet')).toBeNull();
    expect(screen.getByText("Couldn't load apps")).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Try again'));
    expect(mockRefetch).toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Open settings'));
    expect(navigate).toHaveBeenCalledWith('Settings');
  });

  it('keeps the list and banners a failed refresh', () => {
    mockApplications = {
      data: [{ id: 'a1', name: 'Fox Painter', operationCount: 1, updatedAt: new Date().toISOString() }],
      error: new Error('Server returned 502'),
    };
    renderScreen();

    expect(screen.getByText('Fox Painter')).toBeTruthy();
    expect(screen.getByText('Server returned 502')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Retry'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('points an empty server at the assistant', () => {
    const navigate = renderScreen();
    expect(screen.getByText('No apps yet')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Ask the assistant'));
    expect(navigate).toHaveBeenCalledWith('Chat');
  });
});
