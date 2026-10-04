/**
 * The home screen after login: the app list, plus header actions into the
 * companion's other surfaces.
 */
import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../hooks/useApplications', () => ({
  useApplications: () => ({
    data: [],
    isLoading: false,
    isRefetching: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

import AppsScreen from '../AppsScreen';

type HeaderRight = () => React.ReactElement;

describe('AppsScreen', () => {
  it('offers chat, documents, jobs, assets, and settings from the header', async () => {
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
    for (const [label, route] of [
      ['Open chat', 'Chat'],
      ['Open documents', 'Documents'],
      ['Open jobs', 'Jobs'],
      ['Open assets', 'Assets'],
      ['Open settings', 'Settings'],
    ] as const) {
      await user.press(screen.getByLabelText(label));
      expect(navigate).toHaveBeenLastCalledWith(route);
    }
  });
});
