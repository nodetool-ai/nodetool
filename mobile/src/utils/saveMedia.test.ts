import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';

import { cacheFileNameFor, saveMediaToLibrary, saveableMediaKind } from './saveMedia';
import { useAuthStore } from '../stores/AuthStore';
import { setCachedApiHost } from '../services/apiHost';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  downloadAsync: jest.fn(),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-media-library/legacy', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  saveToLibraryAsync: jest.fn().mockResolvedValue(undefined),
}));

const mockedFs = FileSystem as jest.Mocked<typeof FileSystem>;
const mockedMedia = MediaLibrary as jest.Mocked<typeof MediaLibrary>;

const granted: MediaLibrary.PermissionResponse = {
  granted: true,
  canAskAgain: true,
  status: 'granted' as MediaLibrary.PermissionStatus,
  expires: 'never',
};
const denied: MediaLibrary.PermissionResponse = {
  granted: false,
  canAskAgain: true,
  status: 'denied' as MediaLibrary.PermissionStatus,
  expires: 'never',
};

describe('saveableMediaKind', () => {
  it('accepts images and videos', () => {
    expect(saveableMediaKind('image/png')).toBe('image');
    expect(saveableMediaKind('video/mp4')).toBe('video');
  });

  it('rejects everything else', () => {
    expect(saveableMediaKind('audio/mpeg')).toBeNull();
    expect(saveableMediaKind('application/pdf')).toBeNull();
    expect(saveableMediaKind('folder')).toBeNull();
    expect(saveableMediaKind(null)).toBeNull();
  });
});

describe('cacheFileNameFor', () => {
  it('uses the content type extension and sanitizes the name', () => {
    expect(cacheFileNameFor('My cool image!', 'image/png', 'http://h/a')).toBe(
      'My_cool_image.png'
    );
  });

  it('falls back to the URL extension for unknown content types', () => {
    expect(cacheFileNameFor('clip', 'video/avi', 'http://h/x/clip.avi')).toBe(
      'clip.avi'
    );
  });
});

describe('saveMediaToLibrary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setCachedApiHost('http://10.0.0.5:7777');
    useAuthStore.setState({ session: null });
    mockedMedia.getPermissionsAsync.mockResolvedValue(
      granted
    );
    mockedFs.downloadAsync.mockResolvedValue({
      uri: 'file:///cache/download.png',
      status: 200,
      headers: {},
      mimeType: 'image/png',
    });
  });

  it('downloads, saves and cleans up the temp file', async () => {
    const kind = await saveMediaToLibrary({
      url: 'http://10.0.0.5:7777/api/assets/1',
      contentType: 'image/png',
      name: 'shot',
    });

    expect(kind).toBe('image');
    expect(mockedFs.downloadAsync).toHaveBeenCalledWith(
      'http://10.0.0.5:7777/api/assets/1',
      expect.stringMatching(/^file:\/\/\/cache\/\d+-shot\.png$/),
      { headers: {} }
    );
    expect(mockedMedia.saveToLibraryAsync).toHaveBeenCalledWith(
      'file:///cache/download.png'
    );
    expect(mockedFs.deleteAsync).toHaveBeenCalledWith(
      'file:///cache/download.png',
      { idempotent: true }
    );
  });

  it('sends the bearer token for URLs on the API host', async () => {
    useAuthStore.setState({
      session: { access_token: 'tok-123' } as never,
    });

    await saveMediaToLibrary({
      url: 'http://10.0.0.5:7777/api/assets/1',
      contentType: 'image/png',
      name: 'shot',
    });

    expect(mockedFs.downloadAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { headers: { Authorization: 'Bearer tok-123' } }
    );
  });

  it('never sends the token to a foreign origin', async () => {
    useAuthStore.setState({
      session: { access_token: 'tok-123' } as never,
    });

    await saveMediaToLibrary({
      url: 'https://cdn.example.com/presigned.png',
      contentType: 'image/png',
      name: 'shot',
    });

    expect(mockedFs.downloadAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { headers: {} }
    );
  });

  it('rejects unsupported content types before touching permissions', async () => {
    await expect(
      saveMediaToLibrary({
        url: 'http://10.0.0.5:7777/a',
        contentType: 'audio/mpeg',
        name: 'song',
      })
    ).rejects.toThrow(/cannot be saved to the photo library/);
    expect(mockedMedia.getPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requests permission and throws when denied', async () => {
    mockedMedia.getPermissionsAsync.mockResolvedValue(
      denied
    );
    mockedMedia.requestPermissionsAsync.mockResolvedValue(
      denied
    );

    await expect(
      saveMediaToLibrary({
        url: 'http://10.0.0.5:7777/a',
        contentType: 'image/png',
        name: 'shot',
      })
    ).rejects.toThrow(/denied/);
    expect(mockedMedia.requestPermissionsAsync).toHaveBeenCalled();
    expect(mockedFs.downloadAsync).not.toHaveBeenCalled();
  });

  it('throws on a non-2xx download and still deletes the partial file', async () => {
    mockedFs.downloadAsync.mockResolvedValue({
      uri: 'file:///cache/download.png',
      status: 401,
      headers: {},
      mimeType: null,
    });

    await expect(
      saveMediaToLibrary({
        url: 'http://10.0.0.5:7777/a',
        contentType: 'image/png',
        name: 'shot',
      })
    ).rejects.toThrow(/status 401/);
    expect(mockedMedia.saveToLibraryAsync).not.toHaveBeenCalled();
    expect(mockedFs.deleteAsync).toHaveBeenCalled();
  });

  it('propagates network failures', async () => {
    mockedFs.downloadAsync.mockRejectedValue(new Error('Network request failed'));

    await expect(
      saveMediaToLibrary({
        url: 'http://10.0.0.5:7777/a',
        contentType: 'image/png',
        name: 'shot',
      })
    ).rejects.toThrow('Network request failed');
    expect(mockedFs.deleteAsync).not.toHaveBeenCalled();
  });
});
