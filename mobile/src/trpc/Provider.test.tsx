import { Text } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TRPCProvider } from './Provider';

describe('TRPCProvider', () => {
  it('renders children once the persisted cache is restored', async () => {
    render(
      <TRPCProvider>
        <Text>ready</Text>
      </TRPCProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('ready')).toBeTruthy();
    });
  });

  it('restores from AsyncStorage rather than the network', async () => {
    const getItem = jest.spyOn(AsyncStorage, 'getItem');

    render(
      <TRPCProvider>
        <Text>ready</Text>
      </TRPCProvider>
    );

    await waitFor(() => {
      expect(getItem).toHaveBeenCalledWith('nodetool-query-cache');
    });

    getItem.mockRestore();
  });
});
