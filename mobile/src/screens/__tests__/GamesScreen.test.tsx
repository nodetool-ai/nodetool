/**
 * The games list: the user's own games, each opening the player.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import GamesScreen from '../GamesScreen';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockRefetch = jest.fn();
let mockGames: { data: { id: string; name: string; updatedAt: string }[] | undefined; error: Error | null; isLoading: boolean };

jest.mock('../../trpc/client', () => ({
  trpc: {
    games: {
      listAll: {
        useQuery: () => ({
          data: mockGames.data,
          error: mockGames.error,
          isLoading: mockGames.isLoading,
          isRefetching: false,
          refetch: mockRefetch,
        }),
      },
    },
  },
}));

const navigation = { navigate: jest.fn(), setOptions: jest.fn() };

function renderScreen() {
  render(<GamesScreen navigation={navigation as unknown as React.ComponentProps<typeof GamesScreen>['navigation']} />);
}

describe('GamesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGames = { data: [], error: null, isLoading: false };
  });

  it('opens a game in the player', () => {
    mockGames.data = [{ id: 'g1', name: 'Kindle', updatedAt: new Date().toISOString() }];
    renderScreen();
    fireEvent.press(screen.getByLabelText('Play Kindle'));
    expect(navigation.navigate).toHaveBeenCalledWith('GamePlayer', { gameId: 'g1', name: 'Kindle' });
  });

  it('says where games come from when there are none', () => {
    renderScreen();
    expect(screen.getByText('No games yet')).toBeTruthy();
    fireEvent.press(screen.getByText('Ask the assistant'));
    expect(navigation.navigate).toHaveBeenCalledWith('Main', { screen: 'Chat' });
  });

  it('offers a retry when the list fails to load', () => {
    mockGames = { data: undefined, error: new Error('Network request failed'), isLoading: false };
    renderScreen();
    expect(screen.getByText("Couldn't load games")).toBeTruthy();
    fireEvent.press(screen.getByText('Try again'));
    expect(mockRefetch).toHaveBeenCalled();
  });
});
