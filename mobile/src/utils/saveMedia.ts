/**
 * Download a remote image/video and hand it to the device photo library.
 *
 * The asset URL served by NodeTool is usually a path on the configured API
 * host, which may be a LAN address behind Supabase bearer auth — so the
 * download has to carry the same `Authorization` header `ApiService` uses,
 * otherwise the "file" we save is an HTML error page. The header is only
 * attached for URLs on the current API host; presigned URLs pointing at S3 or
 * another origin must never receive the session token.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';

import { getApiHost } from '../services/apiHost';
import { useAuthStore } from '../stores/AuthStore';

export type SaveableMediaKind = 'image' | 'video';

/**
 * The photo library only accepts images and videos. Everything else (audio,
 * text, JSON, PDFs, archives, folders) has no camera-roll representation and
 * keeps the plain Share action instead.
 */
export function saveableMediaKind(
  contentType: string | null | undefined
): SaveableMediaKind | null {
  if (!contentType) {return null;}
  if (contentType.startsWith('image/')) {return 'image';}
  if (contentType.startsWith('video/')) {return 'video';}
  return null;
}

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/tiff': 'tiff',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-m4v': 'm4v',
};

function extensionFor(contentType: string, url: string): string {
  const known = EXTENSION_BY_CONTENT_TYPE[contentType.toLowerCase()];
  if (known) {return known;}
  const fromUrl = url.split(/[?#]/)[0].split('/').pop()?.split('.').pop();
  if (fromUrl && /^[a-z0-9]{2,5}$/i.test(fromUrl)) {return fromUrl.toLowerCase();}
  const subtype = contentType.split('/')[1]?.replace(/[^a-z0-9]/gi, '');
  return subtype ? subtype.toLowerCase() : 'bin';
}

/** A filesystem-safe cache file name derived from the asset name. */
export function cacheFileNameFor(
  name: string,
  contentType: string,
  url: string
): string {
  const extension = extensionFor(contentType, url);
  const base = name
    .replace(/\.[^.]{1,5}$/, '')
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return `${base || 'nodetool-asset'}.${extension}`;
}

/** Bearer header for URLs on our own API host — never for foreign origins. */
function authHeadersFor(url: string): Record<string, string> {
  const host = getApiHost();
  if (!host || !url.startsWith(host)) {return {};}
  const token = useAuthStore.getState().session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function ensureWritePermission(): Promise<void> {
  const current = await MediaLibrary.getPermissionsAsync(true);
  if (current.granted) {return;}
  if (current.canAskAgain === false) {
    throw new Error(
      'NodeTool does not have permission to save to your photo library. Enable photo access in your device settings and try again.'
    );
  }
  const requested = await MediaLibrary.requestPermissionsAsync(true);
  if (!requested.granted) {
    throw new Error(
      'Permission to save to your photo library was denied. Enable photo access in your device settings and try again.'
    );
  }
}

export type SaveMediaParams = {
  /** Fully resolved, absolute asset URL (see `apiService.resolveUrl`). */
  url: string;
  contentType: string;
  /** Asset name, used to build the temp file name. */
  name: string;
};

/**
 * Download `url` to a cache file, save it into the photo library, and remove
 * the temp file. Throws an `Error` with a user-presentable message on
 * unsupported content types, denied permission, and download failures.
 */
export async function saveMediaToLibrary({
  url,
  contentType,
  name,
}: SaveMediaParams): Promise<SaveableMediaKind> {
  const kind = saveableMediaKind(contentType);
  if (!kind) {
    throw new Error(
      `${contentType || 'This file type'} cannot be saved to the photo library. Use Share instead.`
    );
  }

  await ensureWritePermission();

  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) {
    throw new Error('No writable cache directory is available on this device.');
  }

  const target = `${cacheDirectory}${Date.now()}-${cacheFileNameFor(name, contentType, url)}`;
  let downloadedUri: string | null = null;
  try {
    const result = await FileSystem.downloadAsync(url, target, {
      headers: authHeadersFor(url),
    });
    downloadedUri = result.uri;
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`The server returned status ${result.status} for this asset.`);
    }
    await MediaLibrary.saveToLibraryAsync(result.uri);
    return kind;
  } finally {
    if (downloadedUri) {
      await FileSystem.deleteAsync(downloadedUri, { idempotent: true }).catch(
        () => undefined
      );
    }
  }
}
