import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Image,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode, Audio } from 'expo-av';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { apiService, Asset } from '../services/api';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../hooks/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type AssetViewerScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'AssetViewer'>;
  route: RouteProp<RootStackParamList, 'AssetViewer'>;
};

function formatBytes(bytes?: number | null): string {
  if (bytes == null || bytes <= 0) return 'Unknown size';
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
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

function formatDuration(seconds?: number | null): string | null {
  if (seconds == null) return null;
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function AssetViewerScreen({ navigation, route }: AssetViewerScreenProps) {
  const { assetId } = route.params;
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();

  const [asset, setAsset] = useState<Asset | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [isSavingRename, setIsSavingRename] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioPosition, setAudioPosition] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const soundRef = useRef<Audio.Sound | null>(null);

  const loadAsset = useCallback(async () => {
    try {
      setLoadError(null);
      const data = await apiService.getAsset(assetId);
      setAsset(data);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to load asset';
      setLoadError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    loadAsset();
  }, [loadAsset]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: asset?.name || 'Asset',
    });
  }, [navigation, asset?.name]);

  // Audio playback lifecycle
  useEffect(() => {
    const uri = asset?.get_url;
    const isAudio = asset?.content_type?.startsWith('audio/');
    if (!uri || !isAudio) return;

    let isCancelled = false;
    (async () => {
      try {
        const { sound, status } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: false },
          (s) => {
            if (!s.isLoaded) return;
            setAudioPosition(s.positionMillis || 0);
            setIsAudioPlaying(s.isPlaying);
            if (s.didJustFinish) {
              setIsAudioPlaying(false);
              setAudioPosition(0);
            }
          }
        );
        if (isCancelled) {
          await sound.unloadAsync();
          return;
        }
        soundRef.current = sound;
        if (status.isLoaded && status.durationMillis) {
          setAudioDuration(status.durationMillis);
        }
      } catch (err) {
        console.error('Failed to load audio:', err);
      }
    })();

    return () => {
      isCancelled = true;
      const existing = soundRef.current;
      soundRef.current = null;
      if (existing) {
        existing.unloadAsync().catch(() => undefined);
      }
    };
  }, [asset?.get_url, asset?.content_type]);

  const toggleAudio = useCallback(async () => {
    const sound = soundRef.current;
    if (!sound) return;
    try {
      if (isAudioPlaying) {
        await sound.pauseAsync();
      } else {
        await sound.playAsync();
      }
    } catch (err) {
      console.error('Audio playback error:', err);
    }
  }, [isAudioPlaying]);

  const handleOpenRename = useCallback(() => {
    if (!asset) return;
    setRenameValue(asset.name);
    setIsRenaming(true);
  }, [asset]);

  const handleRename = useCallback(async () => {
    if (!asset) return;
    const newName = renameValue.trim();
    if (!newName || newName === asset.name) {
      setIsRenaming(false);
      return;
    }
    try {
      setIsSavingRename(true);
      const updated = await apiService.updateAsset(asset.id, {
        name: newName,
        parent_id: null,
        content_type: null,
      });
      setAsset(updated);
      setIsRenaming(false);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to rename';
      Alert.alert('Error', msg);
    } finally {
      setIsSavingRename(false);
    }
  }, [asset, renameValue]);

  const handleDelete = useCallback(() => {
    if (!asset) return;
    Alert.alert(
      'Delete asset?',
      `This will permanently delete "${asset.name}".`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.deleteAsset(asset.id);
              navigation.goBack();
            } catch (error: unknown) {
              const msg = error instanceof Error ? error.message : 'Failed to delete';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  }, [asset, navigation]);

  const handleShare = useCallback(async () => {
    if (!asset?.get_url) return;
    try {
      await Share.share({
        message: asset.get_url,
        url: asset.get_url,
        title: asset.name,
      });
    } catch (error: unknown) {
      console.error('Share failed:', error);
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
          onPress={loadAsset}
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
  const url = asset.get_url;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <View style={[styles.previewContainer, { backgroundColor: colors.surfaceElevated }]}>
        {isImage && url ? (
          <Image
            source={{ uri: url }}
            style={styles.previewImage}
            resizeMode="contain"
            accessibilityLabel={asset.name}
          />
        ) : isVideo && url ? (
          <Video
            source={{ uri: url }}
            style={styles.previewVideo}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            isLooping={false}
          />
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

function formatAudioTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function iconForContentType(contentType: string): keyof typeof Ionicons.glyphMap {
  if (contentType === 'folder') return 'folder';
  if (contentType.startsWith('image/')) return 'image-outline';
  if (contentType.startsWith('video/')) return 'film-outline';
  if (contentType.startsWith('audio/')) return 'musical-notes-outline';
  if (contentType.startsWith('text/')) return 'document-text-outline';
  if (contentType.includes('pdf')) return 'document-text-outline';
  if (contentType.includes('json') || contentType.includes('xml')) return 'code-outline';
  if (contentType.includes('zip') || contentType.includes('archive')) return 'archive-outline';
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
