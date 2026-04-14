import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { apiService, Asset } from '../services/api';
import { useAuthStore } from '../stores/AuthStore';
import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../hooks/useTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type AssetsScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Assets'>;
  route: RouteProp<RootStackParamList, 'Assets'>;
};

const GRID_COLUMNS = 3;
const GRID_GAP = 10;
const GRID_PADDING = 16;

type LoadMode = 'folder' | 'search';

export default function AssetsScreen({ navigation, route }: AssetsScreenProps) {
  const parentId = route.params?.parentId;
  const folderName = route.params?.folderName;
  const isRootFolder = !parentId;

  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loadMode, setLoadMode] = useState<LoadMode>('folder');
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const screenWidth = Dimensions.get('window').width;
  const itemSize = useMemo(() => {
    const totalGaps = GRID_GAP * (GRID_COLUMNS - 1);
    const available = screenWidth - GRID_PADDING * 2 - totalGaps;
    return Math.floor(available / GRID_COLUMNS);
  }, [screenWidth]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: folderName || 'Assets',
    });
  }, [navigation, folderName]);

  const loadAssets = useCallback(async () => {
    try {
      setLoadError(null);
      if (debouncedQuery.trim().length >= 2) {
        setLoadMode('search');
        const result = await apiService.searchAssets({
          query: debouncedQuery.trim(),
          page_size: 200,
        });
        setAssets((result.assets || []) as unknown as Asset[]);
      } else {
        setLoadMode('folder');
        const result = await apiService.listAssets({
          parent_id: parentId ?? null,
          page_size: 500,
        });
        setAssets(result.assets || []);
      }
    } catch (error: unknown) {
      console.error('Failed to load assets:', error);
      const errorMessage = error instanceof Error ? error.message : 'Network Error';
      setLoadError(errorMessage);
      setAssets([]);
    } finally {
      setIsLoading(false);
    }
  }, [parentId, debouncedQuery]);

  useEffect(() => {
    setIsLoading(true);
    loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      setDebouncedQuery(text);
    }, 300);
  }, []);

  const clearSearch = useCallback(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    setSearchQuery('');
    setDebouncedQuery('');
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadAssets();
    setIsRefreshing(false);
  }, [loadAssets]);

  const handleAssetPress = useCallback((asset: Asset) => {
    if (asset.content_type === 'folder') {
      navigation.push('Assets', {
        parentId: asset.id,
        folderName: asset.name,
      });
    } else {
      navigation.navigate('AssetViewer', { assetId: asset.id });
    }
  }, [navigation]);

  const handleAssetLongPress = useCallback((asset: Asset) => {
    Alert.alert(
      asset.name,
      asset.content_type,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => confirmDelete(asset),
        },
      ]
    );
  }, []);

  const confirmDelete = useCallback((asset: Asset) => {
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
              setAssets((prev) => prev.filter((a) => a.id !== asset.id));
            } catch (error: unknown) {
              const msg = error instanceof Error ? error.message : 'Failed to delete asset';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  }, []);

  const [isUploading, setIsUploading] = useState(false);
  const user = useAuthStore((s) => s.user);

  const getParentIdForUpload = useCallback(() => {
    return parentId ?? user?.id ?? '1';
  }, [parentId, user]);

  const doUpload = useCallback(async (uri: string, name: string, mimeType: string) => {
    setIsUploading(true);
    try {
      const asset = await apiService.uploadAsset({
        uri,
        name,
        contentType: mimeType,
        parentId: getParentIdForUpload(),
      });
      setAssets((prev) => [asset, ...prev]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Upload failed';
      Alert.alert('Upload Error', msg);
    } finally {
      setIsUploading(false);
    }
  }, [getParentIdForUpload]);

  const handlePickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: false,
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    const picked = result.assets[0];
    const name = picked.fileName ?? picked.uri.split('/').pop() ?? 'photo';
    const mimeType = picked.mimeType ?? (picked.type === 'video' ? 'video/mp4' : 'image/jpeg');
    await doUpload(picked.uri, name, mimeType);
  }, [doUpload]);

  const handlePickDocument = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const picked = result.assets[0];
    await doUpload(picked.uri, picked.name, picked.mimeType ?? 'application/octet-stream');
  }, [doUpload]);

  const handleUpload = useCallback(() => {
    Alert.alert('Upload', 'Choose a source', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Photo / Video', onPress: handlePickImage },
      { text: 'File', onPress: handlePickDocument },
    ]);
  }, [handlePickImage, handlePickDocument]);

  const renderAsset = useCallback(({ item }: { item: Asset }) => {
    const isFolder = item.content_type === 'folder';
    const isImage = item.content_type?.startsWith('image/');
    const isVideo = item.content_type?.startsWith('video/');
    const isAudio = item.content_type?.startsWith('audio/');
    const thumb = item.thumb_url || (isImage ? item.get_url : null);

    let iconName: keyof typeof Ionicons.glyphMap = 'document-outline';
    if (isFolder) iconName = 'folder';
    else if (isImage) iconName = 'image-outline';
    else if (isVideo) iconName = 'film-outline';
    else if (isAudio) iconName = 'musical-notes-outline';
    else if (item.content_type?.startsWith('text/')) iconName = 'document-text-outline';

    return (
      <TouchableOpacity
        style={[
          styles.card,
          shadows.small,
          {
            width: itemSize,
            backgroundColor: colors.cardBg,
            borderColor: colors.borderLight,
          },
        ]}
        onPress={() => handleAssetPress(item)}
        onLongPress={() => handleAssetLongPress(item)}
        accessibilityRole="button"
        accessibilityLabel={`${isFolder ? 'Folder' : 'Asset'} ${item.name}`}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.thumbContainer,
            { width: itemSize, height: itemSize, backgroundColor: colors.primaryMuted },
          ]}
        >
          {thumb ? (
            <Image
              source={{ uri: thumb }}
              style={styles.thumbImage}
              resizeMode="cover"
            />
          ) : (
            <Ionicons name={iconName} size={36} color={colors.primary} />
          )}
          {isVideo && (
            <View style={styles.playOverlay}>
              <Ionicons name="play-circle" size={30} color="#FFFFFF" />
            </View>
          )}
        </View>
        <View style={styles.cardLabel}>
          <Text
            style={[styles.cardName, { color: colors.text }]}
            numberOfLines={1}
          >
            {item.name}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }, [colors, shadows, itemSize, handleAssetPress, handleAssetLongPress]);

  const renderEmpty = () => {
    if (isLoading) return null;
    const searchActive = debouncedQuery.trim().length >= 2;
    return (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptyIconWrap, { backgroundColor: colors.primaryMuted }]}>
          <Ionicons
            name={loadError ? 'cloud-offline-outline' : searchActive ? 'search-outline' : 'folder-open-outline'}
            size={36}
            color={colors.primary}
          />
        </View>
        <Text style={[styles.emptyText, { color: colors.text }]}>
          {loadError
            ? 'Could not load assets'
            : searchActive
              ? `No results for "${searchQuery}"`
              : 'No assets yet'}
        </Text>
        {loadError ? (
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            {loadError}
          </Text>
        ) : (
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            {searchActive
              ? 'Try a different search term.'
              : isRootFolder
                ? 'Upload assets from the desktop app or a workflow to see them here.'
                : 'This folder is empty.'}
          </Text>
        )}
      </View>
    );
  };

  if (isLoading && assets.length === 0) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.loadingIconWrap, { backgroundColor: colors.primaryMuted }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          Loading assets...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
        <View style={styles.searchRow}>
          <View
            style={[
              styles.searchBar,
              { backgroundColor: colors.inputBg, borderColor: colors.borderLight, flex: 1 },
            ]}
          >
            <Ionicons
              name="search"
              size={18}
              color={colors.textTertiary}
              style={styles.searchIcon}
            />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder={isRootFolder ? 'Search all assets...' : 'Search in folder...'}
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              accessibilityLabel="Search assets"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={clearSearch}
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[styles.uploadButton, { backgroundColor: colors.primary }]}
            onPress={handleUpload}
            disabled={isUploading}
            accessibilityRole="button"
            accessibilityLabel="Upload asset"
          >
            {isUploading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={assets}
        renderItem={renderAsset}
        keyExtractor={(item) => item.id}
        numColumns={GRID_COLUMNS}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingBottom: insets.bottom + 24,
          },
          assets.length === 0 && styles.listContentEmpty,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          loadMode === 'search' && assets.length > 0 ? (
            <Text style={[styles.listHeader, { color: colors.textSecondary }]}>
              {assets.length} result{assets.length === 1 ? '' : 's'}
            </Text>
          ) : null
        }
        ListEmptyComponent={renderEmpty}
      />
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
  loadingIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 15,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  uploadButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    height: 42,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  listContent: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: 8,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  listHeader: {
    fontSize: 13,
    marginBottom: 12,
    marginLeft: 2,
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  thumbContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  cardLabel: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  cardName: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 40,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
