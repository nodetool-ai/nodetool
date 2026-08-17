import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import AssetViewerScreen from './AssetViewerScreen';
import { saveMediaToLibrary } from '../utils/saveMedia';
import type { Asset } from '../services/api';

jest.mock('../utils/saveMedia', () => ({
  saveMediaToLibrary: jest.fn(),
  saveableMediaKind: (contentType: string | null | undefined) => {
    if (contentType?.startsWith('image/')) {return 'image';}
    if (contentType?.startsWith('video/')) {return 'video';}
    return null;
  },
}));

const imageAsset: Asset = {
  id: 'asset-1',
  name: 'render.png',
  content_type: 'image/png',
  get_url: '/api/assets/asset-1/file',
  size: 1024,
  created_at: '2026-01-01T00:00:00Z',
} as Asset;

let mockAsset: Asset = imageAsset;

jest.mock('../trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      assets: { get: { invalidate: jest.fn() }, list: { invalidate: jest.fn() } },
    }),
    assets: {
      get: {
        useQuery: () => ({
          data: mockAsset,
          isLoading: false,
          error: null,
          refetch: jest.fn(),
        }),
      },
      update: { useMutation: () => ({ mutateAsync: jest.fn() }) },
      delete: { useMutation: () => ({ mutate: jest.fn() }) },
    },
  },
}));

const mockedSave = saveMediaToLibrary as jest.MockedFunction<typeof saveMediaToLibrary>;

const navigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  navigate: jest.fn(),
};
const route = { params: { assetId: 'asset-1' } };

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AssetViewerScreen
        navigation={navigation as never}
        route={route as never}
      />
    </SafeAreaProvider>
  );
}

describe('AssetViewerScreen save to library', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAsset = imageAsset;
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('offers Save for images', () => {
    renderScreen();
    expect(screen.getByLabelText('Save to photo library')).toBeTruthy();
  });

  it('hides Save for non-media types but keeps Share', () => {
    mockAsset = { ...imageAsset, content_type: 'application/pdf' };
    renderScreen();
    expect(screen.queryByLabelText('Save to photo library')).toBeNull();
    expect(screen.getByLabelText('Share asset')).toBeTruthy();
  });

  it('saves the resolved URL and confirms success', async () => {
    mockedSave.mockResolvedValue('image');
    renderScreen();

    fireEvent.press(screen.getByLabelText('Save to photo library'));

    await waitFor(() => {
      expect(mockedSave).toHaveBeenCalledWith({
        url: 'http://localhost:7777/api/assets/asset-1/file',
        contentType: 'image/png',
        name: 'render.png',
      });
    });
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Saved',
        'Image saved to your photo library.'
      );
    });
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success
    );
  });

  it('shows a busy state while saving', async () => {
    let resolveSave: (kind: 'image') => void = () => undefined;
    mockedSave.mockImplementation(
      () => new Promise((resolve) => { resolveSave = resolve; })
    );
    renderScreen();

    fireEvent.press(screen.getByLabelText('Save to photo library'));

    await waitFor(() => {
      expect(screen.getByLabelText('Save to photo library').props.accessibilityState)
        .toMatchObject({ disabled: true });
    });

    resolveSave('image');
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
  });

  it('surfaces save failures in an alert', async () => {
    mockedSave.mockRejectedValue(new Error('Permission denied'));
    renderScreen();

    fireEvent.press(screen.getByLabelText('Save to photo library'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Save failed', 'Permission denied');
    });
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Error
    );
  });

  it('does not buzz for the actions that are not outcomes', () => {
    renderScreen();

    fireEvent.press(screen.getByLabelText('Share asset'));
    fireEvent.press(screen.getByLabelText('Rename asset'));

    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });
});
