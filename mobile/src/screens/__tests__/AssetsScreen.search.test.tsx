/**
 * Asset search on a phone: a result shows what matched when it was not the name.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import AssetsScreen from '../AssetsScreen';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../stores/AuthStore', () => ({
  useAuthStore: (select: (state: { user: null }) => unknown) => select({ user: null }),
}));
jest.mock('../../services/api', () => ({
  apiService: { resolveUrl: () => null, uploadAsset: jest.fn() },
}));

const searchResult = {
  assets: [
    {
      id: 'a1',
      name: 'render.png',
      content_type: 'text/plain',
      match: { field: 'prompt', snippet: 'a red fox in the snow', locator: null },
    },
    {
      id: 'a2',
      name: 'fox.txt',
      content_type: 'text/plain',
      match: { field: 'title', snippet: 'fox.txt', locator: null },
    },
  ],
};
const query = (data: unknown) => () => ({ data, error: null, isLoading: false, isRefetching: false, refetch: jest.fn() });

jest.mock('../../trpc/client', () => ({
  trpc: {
    useUtils: () => ({ assets: { list: { invalidate: jest.fn() }, search: { invalidate: jest.fn() } } }),
    assets: {
      search: { useQuery: (_input: { query: string }, opts: { enabled: boolean }) => query(opts.enabled ? searchResult : undefined)() },
      list: { useQuery: () => query({ assets: [] })() },
      delete: { useMutation: () => ({ mutate: jest.fn() }) },
    },
  },
}));

const navigation = { navigate: jest.fn(), setOptions: jest.fn(), dispatch: jest.fn(), push: jest.fn() };

it('shows the matched passage under a result found by its prompt, not its name', () => {
  jest.useFakeTimers();
  render(
    <AssetsScreen
      navigation={navigation as unknown as React.ComponentProps<typeof AssetsScreen>['navigation']}
      route={{ key: 'Assets', name: 'Assets', params: {} } as unknown as React.ComponentProps<typeof AssetsScreen>['route']}
    />
  );
  fireEvent.changeText(screen.getByPlaceholderText('Search all assets...'), 'fox');
  act(() => {
    jest.runAllTimers();
  });
  expect(screen.getByText('a red fox in the snow')).toBeTruthy();
  expect(screen.getAllByText('fox.txt')).toHaveLength(1);
  jest.useRealTimers();
});
