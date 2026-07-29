import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
  PanResponder,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Share,
  type LayoutChangeEvent,
  type NativeTouchEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { MediaPlayerView } from '../components/media/MediaPlayerView';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { apiService, type Asset } from '../services/api';
import { trpc } from '../trpc/client';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../hooks/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { saveMediaToLibrary, saveableMediaKind } from '../utils/saveMedia';
import { hapticImpact, hapticNotification } from '../utils/haptics';

/** Fit-to-frame. The image can never be smaller than the preview box. */
export const MIN_ZOOM_SCALE = 1;
export const MAX_ZOOM_SCALE = 4;
/** Where a double-tap lands when the image is currently at fit. */
const DOUBLE_TAP_ZOOM_SCALE = 2;
const DOUBLE_TAP_WINDOW_MS = 280;
/** A press that moves less than this (in dp) still counts as a tap. */
const TAP_SLOP = 16;
/** Below this the image is at fit and pans are pinned to the frame. */
const ZOOM_EPSILON = 0.01;

/** Distance between the first two active touches, 0 for a single finger. */
export function touchDistance(
  touches: readonly Pick<NativeTouchEvent, 'pageX' | 'pageY'>[]
): number {
  if (touches.length < 2) {return 0;}
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * How far the image may travel along one axis before its edge would leave the
 * frame. At fit (and below) the answer is zero, which is what keeps a
 * zoomed-out image from being flung off-screen.
 */
export function maxTranslation(containerSize: number, scale: number): number {
  return Math.max(0, (containerSize * (scale - MIN_ZOOM_SCALE)) / 2);
}

export function clampTranslation(
  value: number,
  containerSize: number,
  scale: number
): number {
  const limit = maxTranslation(containerSize, scale);
  return clamp(value, -limit, limit);
}

type ZoomableImageProps = {
  uri: string;
  accessibilityLabel: string;
  onZoomChange: (isZoomed: boolean) => void;
};

/**
 * Pinch-to-zoom / pan / double-tap image, built on core RN only (`Animated` +
 * `PanResponder`) — no gesture-handler or reanimated in this app's tree.
 *
 * The live transform is written straight onto `Animated.Value`s with
 * `setValue` during the gesture; only the double-tap and the snap-back at
 * gesture end are actual animations. Gesture bookkeeping lives in a mutable ref
 * so a moving finger never triggers a React render.
 */
function ZoomableImage({ uri, accessibilityLabel, onZoomChange }: ZoomableImageProps) {
  const scale = useRef(new Animated.Value(MIN_ZOOM_SCALE)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;

  const gesture = useRef({
    scale: MIN_ZOOM_SCALE,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    pinchStartDistance: 0,
    pinchStartScale: MIN_ZOOM_SCALE,
    /** gestureState delta at the last re-baseline (touch count change). */
    panBaseDx: 0,
    panBaseDy: 0,
    /** Translation at the last re-baseline. */
    panOriginX: 0,
    panOriginY: 0,
    touchCount: 0,
    didPinch: false,
    lastTapAt: 0,
    reportedZoomed: false,
  }).current;

  const panResponder = useMemo(() => {
    const write = () => {
      scale.setValue(gesture.scale);
      translateX.setValue(gesture.x);
      translateY.setValue(gesture.y);
    };

    const clampToFrame = () => {
      gesture.x = clampTranslation(gesture.x, gesture.width, gesture.scale);
      gesture.y = clampTranslation(gesture.y, gesture.height, gesture.scale);
    };

    const reportZoom = () => {
      const isZoomed = gesture.scale > MIN_ZOOM_SCALE + ZOOM_EPSILON;
      if (isZoomed !== gesture.reportedZoomed) {
        gesture.reportedZoomed = isZoomed;
        onZoomChangeRef.current(isZoomed);
      }
    };

    const rebaseline = (dx: number, dy: number) => {
      gesture.panBaseDx = dx;
      gesture.panBaseDy = dy;
      gesture.panOriginX = gesture.x;
      gesture.panOriginY = gesture.y;
    };

    const animateTo = (nextScale: number, nextX: number, nextY: number) => {
      gesture.scale = nextScale;
      gesture.x = nextX;
      gesture.y = nextY;
      clampToFrame();
      reportZoom();
      // JS-driven on purpose: the same values are written with `setValue`
      // every frame of a gesture, and a value that has been handed to the
      // native driver can no longer be driven from JS.
      Animated.parallel([
        Animated.spring(scale, { toValue: gesture.scale, useNativeDriver: false, friction: 8 }),
        Animated.spring(translateX, { toValue: gesture.x, useNativeDriver: false, friction: 8 }),
        Animated.spring(translateY, { toValue: gesture.y, useNativeDriver: false, friction: 8 }),
      ]).start();
    };

    /** Double-tap: back to fit when zoomed, otherwise zoom in on the tap. */
    const handleDoubleTap = (locationX: number, locationY: number) => {
      hapticImpact('light');
      if (gesture.scale > MIN_ZOOM_SCALE + ZOOM_EPSILON) {
        animateTo(MIN_ZOOM_SCALE, 0, 0);
        return;
      }
      // Keep the tapped point under the finger as the image grows.
      const focalX = locationX - gesture.width / 2;
      const focalY = locationY - gesture.height / 2;
      const ratio = DOUBLE_TAP_ZOOM_SCALE / gesture.scale;
      animateTo(
        DOUBLE_TAP_ZOOM_SCALE,
        gesture.x - focalX * (ratio - 1),
        gesture.y - focalY * (ratio - 1)
      );
    };

    return PanResponder.create({
      // Claim the touch so double-taps register; the parent ScrollView is
      // disabled while zoomed so vertical scrolling still works at fit.
      onStartShouldSetPanResponder: () => true,
      // `evt` is optional-chained because RTL probes this predicate with no
      // event to decide whether a node accepts fired events.
      onMoveShouldSetPanResponder: (evt) =>
        (evt?.nativeEvent?.touches?.length ?? 0) > 1 ||
        gesture.scale > MIN_ZOOM_SCALE + ZOOM_EPSILON,
      onPanResponderTerminationRequest: () => false,

      onPanResponderGrant: () => {
        gesture.touchCount = 0;
        gesture.didPinch = false;
        gesture.pinchStartDistance = 0;
        rebaseline(0, 0);
      },

      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length !== gesture.touchCount) {
          gesture.touchCount = touches.length;
          gesture.pinchStartDistance = 0;
          rebaseline(gestureState.dx, gestureState.dy);
        }

        if (touches.length > 1) {
          const distance = touchDistance(touches);
          if (distance <= 0) {return;}
          if (gesture.pinchStartDistance === 0) {
            gesture.pinchStartDistance = distance;
            gesture.pinchStartScale = gesture.scale;
            return;
          }
          gesture.didPinch = true;
          gesture.scale = clamp(
            (gesture.pinchStartScale * distance) / gesture.pinchStartDistance,
            MIN_ZOOM_SCALE,
            MAX_ZOOM_SCALE
          );
          clampToFrame();
          write();
          reportZoom();
          return;
        }

        if (gesture.scale <= MIN_ZOOM_SCALE + ZOOM_EPSILON) {return;}
        gesture.x = clampTranslation(
          gesture.panOriginX + (gestureState.dx - gesture.panBaseDx),
          gesture.width,
          gesture.scale
        );
        gesture.y = clampTranslation(
          gesture.panOriginY + (gestureState.dy - gesture.panBaseDy),
          gesture.height,
          gesture.scale
        );
        write();
      },

      onPanResponderRelease: (evt, gestureState) => {
        const wasTap =
          !gesture.didPinch &&
          Math.abs(gestureState.dx) < TAP_SLOP &&
          Math.abs(gestureState.dy) < TAP_SLOP;

        if (wasTap) {
          const now = Date.now();
          if (now - gesture.lastTapAt < DOUBLE_TAP_WINDOW_MS) {
            gesture.lastTapAt = 0;
            const { locationX, locationY } = evt.nativeEvent;
            handleDoubleTap(locationX, locationY);
            return;
          }
          gesture.lastTapAt = now;
        }

        gesture.touchCount = 0;
        gesture.pinchStartDistance = 0;
        gesture.didPinch = false;

        // A pinch that ended below fit springs back instead of sitting small.
        if (gesture.scale <= MIN_ZOOM_SCALE + ZOOM_EPSILON) {
          animateTo(MIN_ZOOM_SCALE, 0, 0);
          return;
        }
        clampToFrame();
        write();
        reportZoom();
      },
    });
  }, [gesture, scale, translateX, translateY]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      gesture.width = width;
      gesture.height = height;
    },
    [gesture]
  );

  return (
    <View
      style={styles.zoomSurface}
      onLayout={handleLayout}
      testID="asset-zoom-surface"
      {...panResponder.panHandlers}
    >
      <Animated.Image
        source={{ uri }}
        style={[
          styles.previewImage,
          { transform: [{ translateX }, { translateY }, { scale }] },
        ]}
        resizeMode="contain"
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

type AssetViewerScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AssetViewer'>;
  route: RouteProp<RootStackParamList, 'AssetViewer'>;
};

function formatBytes(bytes?: number | null): string {
  if (bytes == null || bytes <= 0) {return 'Unknown size';}
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(size < 10 && unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}

function formatDate(iso?: string): string {
  if (!iso) {return '-';}
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function formatDuration(seconds?: number | null): string | null {
  if (seconds == null) {return null;}
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AssetViewerScreen({ navigation, route }: AssetViewerScreenProps) {
  const { assetId } = route.params;
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [isSavingRename, setIsSavingRename] = useState(false);
  const [isSavingToLibrary, setIsSavingToLibrary] = useState(false);
  const [isImageZoomed, setIsImageZoomed] = useState(false);

  const utils = trpc.useUtils();
  const assetQuery = trpc.assets.get.useQuery({ id: assetId });
  const asset = (assetQuery.data ?? null) as Asset | null;
  const isLoading = assetQuery.isLoading;
  const loadError = assetQuery.error
    ? assetQuery.error.message || 'Failed to load asset'
    : null;
  const refetch = assetQuery.refetch;

  const updateAsset = trpc.assets.update.useMutation({
    onSuccess: () => { utils.assets.get.invalidate({ id: assetId }); },
  });
  const deleteAsset = trpc.assets.delete.useMutation({
    onSuccess: () => {
      utils.assets.list.invalidate();
      navigation.goBack();
    },
    onError: (e) => { Alert.alert('Error', e.message); },
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      title: asset?.name || 'Asset',
    });
  }, [navigation, asset?.name]);

  // Audio playback. The player is created unconditionally (hook rules) and
  // stays sourceless until the asset resolves to an audio URL.
  const audioSource = useMemo(() => {
    const uri = apiService.resolveUrl(asset?.get_url);
    if (!uri || !asset?.content_type?.startsWith('audio/')) {return null;}
    return { uri };
  }, [asset?.get_url, asset?.content_type]);

  const audioPlayer = useAudioPlayer(audioSource);
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  const isAudioPlaying = audioStatus.playing;
  const audioPosition = audioStatus.didJustFinish ? 0 : audioStatus.currentTime;
  const audioDuration = audioStatus.duration;

  const toggleAudio = useCallback(() => {
    if (isAudioPlaying) {
      audioPlayer.pause();
      return;
    }
    if (audioStatus.didJustFinish) {
      audioPlayer.seekTo(0);
    }
    audioPlayer.play();
  }, [audioPlayer, isAudioPlaying, audioStatus.didJustFinish]);

  const handleOpenRename = useCallback(() => {
    if (!asset) {return;}
    setRenameValue(asset.name);
    setIsRenaming(true);
  }, [asset]);

  const handleRename = useCallback(async () => {
    if (!asset) {return;}
    const newName = renameValue.trim();
    if (!newName || newName === asset.name) {
      setIsRenaming(false);
      return;
    }
    try {
      setIsSavingRename(true);
      await updateAsset.mutateAsync({ id: asset.id, name: newName });
      setIsRenaming(false);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to rename';
      Alert.alert('Error', msg);
    } finally {
      setIsSavingRename(false);
    }
  }, [asset, renameValue, updateAsset]);

  const handleDelete = useCallback(() => {
    if (!asset) {return;}
    Alert.alert(
      'Delete asset?',
      `This will permanently delete "${asset.name}".`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => { deleteAsset.mutate({ id: asset.id }); },
        },
      ]
    );
  }, [asset, deleteAsset]);

  const handleShare = useCallback(async () => {
    if (!asset?.get_url) {return;}
    try {
      await Share.share({
        message: asset.get_url,
        url: asset.get_url,
        title: asset.name,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to share asset';
      Alert.alert('Share failed', msg);
    }
  }, [asset]);

  const handleSaveToLibrary = useCallback(async () => {
    const downloadUrl = apiService.resolveUrl(asset?.get_url);
    if (!asset || !downloadUrl) {return;}
    setIsSavingToLibrary(true);
    try {
      const kind = await saveMediaToLibrary({
        url: downloadUrl,
        contentType: asset.content_type || '',
        name: asset.name,
      });
      hapticNotification('success');
      Alert.alert(
        'Saved',
        kind === 'video'
          ? 'Video saved to your photo library.'
          : 'Image saved to your photo library.'
      );
    } catch (error: unknown) {
      hapticNotification('error');
      const msg =
        error instanceof Error ? error.message : 'Could not save this asset.';
      Alert.alert('Save failed', msg);
    } finally {
      setIsSavingToLibrary(false);
    }
  }, [asset]);

  if (isLoading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (loadError || !asset) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.errorIconWrap, { backgroundColor: colors.primaryMuted }]}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.error} />
        </View>
        <Text style={[styles.errorText, { color: colors.text }]}>
          Could not load asset
        </Text>
        {loadError ? (
          <Text style={[styles.errorSubtext, { color: colors.textSecondary }]}>
            {loadError}
          </Text>
        ) : null}
        <TouchableOpacity
          style={[styles.actionButton, shadows.small, { backgroundColor: colors.primary }]}
          onPress={() => { refetch(); }}
          accessibilityRole="button"
          accessibilityLabel="Retry"
        >
          <Ionicons name="refresh-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.actionButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const contentType = asset.content_type || '';
  const isImage = contentType.startsWith('image/');
  const isVideo = contentType.startsWith('video/');
  const isAudio = contentType.startsWith('audio/');
  const url = apiService.resolveUrl(asset.get_url);
  const canSaveToLibrary = url != null && saveableMediaKind(contentType) != null;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      scrollEnabled={!isImageZoomed}
    >
      <View style={[styles.previewContainer, { backgroundColor: colors.surfaceElevated }]}>
        {isImage && url ? (
          <ZoomableImage
            uri={url}
            accessibilityLabel={asset.name}
            onZoomChange={setIsImageZoomed}
          />
        ) : isVideo && url ? (
          <MediaPlayerView uri={url} style={styles.previewVideo} />
        ) : isAudio ? (
          <View style={styles.audioPreview}>
            <View style={[styles.audioIconWrap, { backgroundColor: colors.primaryMuted }]}>
              <Ionicons name="musical-notes" size={48} color={colors.primary} />
            </View>
            <TouchableOpacity
              onPress={toggleAudio}
              style={[styles.audioPlayButton, { backgroundColor: colors.primary }]}
              accessibilityRole="button"
              accessibilityLabel={isAudioPlaying ? 'Pause audio' : 'Play audio'}
            >
              <Ionicons
                name={isAudioPlaying ? 'pause' : 'play'}
                size={28}
                color={colors.textOnPrimary}
              />
            </TouchableOpacity>
            <View style={[styles.audioProgress, { backgroundColor: colors.borderLight }]}>
              <View
                style={[
                  styles.audioProgressFill,
                  {
                    backgroundColor: colors.primary,
                    width: audioDuration > 0
                      ? `${Math.min(100, (audioPosition / audioDuration) * 100)}%`
                      : '0%',
                  },
                ]}
              />
            </View>
            <Text style={[styles.audioTime, { color: colors.textSecondary }]}>
              {formatAudioTime(audioPosition)} / {formatAudioTime(audioDuration)}
            </Text>
          </View>
        ) : (
          <View style={styles.filePreview}>
            <View style={[styles.fileIconWrap, { backgroundColor: colors.primaryMuted }]}>
              <Ionicons
                name={iconForContentType(contentType)}
                size={56}
                color={colors.primary}
              />
            </View>
            <Text style={[styles.fileTypeText, { color: colors.textSecondary }]}>
              {contentType || 'Unknown type'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.infoSection}>
        <Text style={[styles.assetName, { color: colors.text }]} numberOfLines={2}>
          {asset.name}
        </Text>
        <Text style={[styles.assetMeta, { color: colors.textSecondary }]}>
          {contentType || 'Unknown'} · {formatBytes(asset.size)}
        </Text>
      </View>

      <View style={[styles.detailCard, shadows.small, { backgroundColor: colors.cardBg, borderColor: colors.borderLight }]}>
        <DetailRow label="Name" value={asset.name} colors={colors} />
        <DetailRow label="Type" value={contentType || 'Unknown'} colors={colors} />
        <DetailRow label="Size" value={formatBytes(asset.size)} colors={colors} />
        {formatDuration(asset.duration) && (
          <DetailRow
            label="Duration"
            value={formatDuration(asset.duration) as string}
            colors={colors}
          />
        )}
        <DetailRow label="Created" value={formatDate(asset.created_at)} colors={colors} />
        <DetailRow label="ID" value={asset.id} colors={colors} mono last />
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.primary }]}
          onPress={handleOpenRename}
          accessibilityRole="button"
          accessibilityLabel="Rename asset"
        >
          <Ionicons name="create-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.actionButtonText}>Rename</Text>
        </TouchableOpacity>
        {canSaveToLibrary && (
          <TouchableOpacity
            style={[
              styles.actionButtonOutline,
              { backgroundColor: colors.surface, borderColor: colors.border },
              isSavingToLibrary && styles.actionButtonDisabled,
            ]}
            onPress={handleSaveToLibrary}
            disabled={isSavingToLibrary}
            accessibilityRole="button"
            accessibilityLabel="Save to photo library"
            accessibilityState={{ disabled: isSavingToLibrary, busy: isSavingToLibrary }}
          >
            {isSavingToLibrary ? (
              <ActivityIndicator
                color={colors.text}
                size="small"
                style={{ marginRight: 6 }}
              />
            ) : (
              <Ionicons
                name="download-outline"
                size={18}
                color={colors.text}
                style={{ marginRight: 6 }}
              />
            )}
            <Text style={[styles.actionButtonOutlineText, { color: colors.text }]}>
              {isSavingToLibrary ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        )}
        {url && (
          <TouchableOpacity
            style={[styles.actionButtonOutline, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={handleShare}
            accessibilityRole="button"
            accessibilityLabel="Share asset"
          >
            <Ionicons name="share-outline" size={18} color={colors.text} style={{ marginRight: 6 }} />
            <Text style={[styles.actionButtonOutlineText, { color: colors.text }]}>Share</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.actionButtonOutline, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={handleDelete}
          accessibilityRole="button"
          accessibilityLabel="Delete asset"
        >
          <Ionicons name="trash-outline" size={18} color={colors.error} style={{ marginRight: 6 }} />
          <Text style={[styles.actionButtonOutlineText, { color: colors.error }]}>Delete</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={isRenaming}
        transparent
        animationType="fade"
        onRequestClose={() => setIsRenaming(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={[styles.modalCard, shadows.large, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Rename asset</Text>
            <TextInput
              style={[
                styles.modalInput,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.inputBg,
                },
              ]}
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Asset name"
              placeholderTextColor={colors.textTertiary}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              selectTextOnFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.actionButtonOutline, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => setIsRenaming(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel rename"
                disabled={isSavingRename}
              >
                <Text style={[styles.actionButtonOutlineText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.primary }]}
                onPress={handleRename}
                accessibilityRole="button"
                accessibilityLabel="Save rename"
                disabled={isSavingRename}
              >
                {isSavingRename ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.actionButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

function formatAudioTime(seconds: number): string {
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const rest = totalSeconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}

function iconForContentType(contentType: string): keyof typeof Ionicons.glyphMap {
  if (contentType === 'folder') {return 'folder';}
  if (contentType.startsWith('image/')) {return 'image-outline';}
  if (contentType.startsWith('video/')) {return 'film-outline';}
  if (contentType.startsWith('audio/')) {return 'musical-notes-outline';}
  if (contentType.startsWith('text/')) {return 'document-text-outline';}
  if (contentType.includes('pdf')) {return 'document-text-outline';}
  if (contentType.includes('json') || contentType.includes('xml')) {return 'code-outline';}
  if (contentType.includes('zip') || contentType.includes('archive')) {return 'archive-outline';}
  return 'document-outline';
}

type DetailRowProps = {
  label: string;
  value: string;
  colors: {
    text: string;
    textSecondary: string;
    borderLight: string;
  };
  mono?: boolean;
  last?: boolean;
};

function DetailRow({ label, value, colors, mono, last }: DetailRowProps) {
  return (
    <View
      style={[
        styles.detailRow,
        !last && { borderBottomColor: colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text
        style={[
          styles.detailValue,
          { color: colors.text },
          mono && styles.detailValueMono,
        ]}
        selectable
        numberOfLines={mono ? 1 : 2}
        ellipsizeMode={mono ? 'middle' : 'tail'}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  previewContainer: {
    width: '100%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    // A zoomed image stays inside its frame instead of bleeding over the
    // details below it.
    overflow: 'hidden',
  },
  zoomSurface: {
    width: '100%',
    height: '100%',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewVideo: {
    width: '100%',
    height: '100%',
  },
  filePreview: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileIconWrap: {
    width: 120,
    height: 120,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  fileTypeText: {
    fontSize: 13,
  },
  audioPreview: {
    width: '100%',
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  audioPlayButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  audioProgress: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  audioProgressFill: {
    height: '100%',
  },
  audioTime: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  infoSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  assetName: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  assetMeta: {
    fontSize: 14,
  },
  detailCard: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  detailRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    alignItems: 'flex-start',
  },
  detailLabel: {
    fontSize: 13,
    width: 80,
    marginRight: 8,
  },
  detailValue: {
    flex: 1,
    fontSize: 14,
  },
  detailValueMono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
    flexWrap: 'wrap',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  actionButtonOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonOutlineText: {
    fontSize: 15,
    fontWeight: '600',
  },
  errorIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  errorSubtext: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
});
