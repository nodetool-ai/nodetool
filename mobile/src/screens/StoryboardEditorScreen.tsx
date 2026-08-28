/**
 * Storyboard editor.
 *
 * The phone half of the storyboard surface: read a board, fix its brief, style,
 * and shot list, reorder, save. Generation stays on the desktop app, so this
 * screen is deliberately a text-and-thumbnails editor.
 *
 * It is also the agent's hands on the board. The handler registered here mutates
 * the same `documentStore` the render reads, so a `ui_storyboard_*` call repaints
 * the screen the user is holding, and `ui_storyboard_save` is the same code path
 * as the Save button.
 */

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type TextInputContentSizeChangeEventData,
  type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import type { Shot, ShotStatus } from '@nodetool-ai/protocol';

import { RootStackParamList } from '../navigation/types';
import { apiService } from '../services/api';
import { useTheme } from '../hooks/useTheme';
import DocumentStatusBanner from '../components/DocumentStatusBanner';
import EditorHeaderActions from '../components/EditorHeaderActions';
import { documentStore } from '../documents/documentStore';
import {
  registerDocumentHandler,
  setDocumentTitle,
  setFocusedDocument,
} from '../documents/agentBridge';
import { clearUiSelection, setUiSelection } from '../documents/uiContext';
import {
  reindexShots,
  resolveShotIndex,
  shotToNode,
  type StoryboardAddShotInput,
  type StoryboardAgentHandler,
  type StoryboardDocument,
  type StoryboardShotNode,
  type StoryboardSnapshot,
  type StoryboardUpdateShotPatch,
} from '../documents/storyboardTypes';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'StoryboardEditor'>;
  route: RouteProp<RootStackParamList, 'StoryboardEditor'>;
};

const DEFAULT_ASPECT_RATIO = '16:9';

/** Short, collision-resistant enough for ids that only have to be unique in one board. */
const newShotId = (): string =>
  `shot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** 18pt icon + 10pt padding = 38pt; the slop lifts it to the 46pt touch target. */
const ICON_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 };

/**
 * Width the title cannot have: the back button plus the actions (chat bubble,
 * gap, Save) plus the gutters around them.
 */
const HEADER_RESERVED_WIDTH = 164;

const MULTILINE_MIN_HEIGHT = 68;

/**
 * Multiline field that grows to fit its text.
 *
 * A plain multiline `TextInput` with a fixed height clips its own content — on
 * web it is a `textarea` that never resizes — so a brief long enough to wrap
 * three times got cut through the middle of the third row. Following the
 * content size keeps every wrapped row visible while typing.
 */
function GrowingTextInput({ style, ...rest }: TextInputProps) {
  const [height, setHeight] = useState(MULTILINE_MIN_HEIGHT);
  const onContentSizeChange = useCallback(
    (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      setHeight(event.nativeEvent.contentSize.height);
    },
    []
  );
  return (
    <TextInput
      {...rest}
      multiline
      onContentSizeChange={onContentSizeChange}
      style={[style, { height: Math.max(MULTILINE_MIN_HEIGHT, height) }]}
    />
  );
}

const STATUS_LABELS = {
  planned: 'Planned',
  keyframe_generating: 'Still…',
  keyframe_ready: 'Still ready',
  approved: 'Still ready',
  clip_generating: 'Rendering…',
  rendered: 'Rendered',
  failed: 'Failed',
} satisfies Record<ShotStatus, string>;

interface ShotCardProps {
  shot: Shot;
  index: number;
  isLast: boolean;
  isSelected: boolean;
  onSelect: (shotId: string | null) => void;
  onPatch: (shotId: string, patch: Partial<Shot>) => void;
  onMove: (shotId: string, delta: number) => void;
  onRemove: (shotId: string) => void;
}

/**
 * `patchShot` rebuilds only the shot it edits and hands back every other shot
 * object unchanged, so memoizing here turns a keystroke from a repaint of every
 * card on the board — four text fields and a thumbnail each — into a repaint of
 * one. That only holds while the handlers stay stable, so they are bound per
 * shot here, not at the call site.
 */
const ShotCard = React.memo(function ShotCard({
  shot,
  index,
  isLast,
  isSelected,
  onSelect,
  onPatch,
  onMove,
  onRemove,
}: ShotCardProps) {
  const { colors, shadows } = useTheme();
  const thumbnail = apiService.resolveUrl(shot.keyframe?.uri);

  const handleSelect = useCallback(
    () => onSelect(isSelected ? null : shot.id),
    [onSelect, isSelected, shot.id]
  );
  const handleAction = useCallback(
    (action: string) => onPatch(shot.id, { action }),
    [onPatch, shot.id]
  );
  const handleSlug = useCallback(
    (slug: string) => onPatch(shot.id, { slug }),
    [onPatch, shot.id]
  );
  const handleMotion = useCallback(
    (motion: string) => onPatch(shot.id, { motion }),
    [onPatch, shot.id]
  );
  const handleDuration = useCallback(
    (text: string) => {
      const parsed = Number.parseFloat(text);
      onPatch(shot.id, {
        duration_seconds: Number.isFinite(parsed) ? parsed : undefined,
      });
    },
    [onPatch, shot.id]
  );
  const handleMoveUp = useCallback(() => onMove(shot.id, -1), [onMove, shot.id]);
  const handleMoveDown = useCallback(() => onMove(shot.id, 1), [onMove, shot.id]);
  const handleRemove = useCallback(() => onRemove(shot.id), [onRemove, shot.id]);

  return (
    <View
      style={[
        styles.card,
        shadows.small,
        {
          backgroundColor: colors.cardBg,
          borderColor: isSelected ? colors.primary : colors.borderLight,
        },
      ]}
    >
      <TouchableOpacity
        onPress={handleSelect}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Select shot ${index + 1}`}
        accessibilityState={{ selected: isSelected }}
        style={styles.cardHeader}
      >
        <View
          style={[
            styles.indexBadge,
            {
              backgroundColor: isSelected ? colors.primary : colors.primaryMuted,
            },
          ]}
        >
          <Text
            style={[
              styles.indexBadgeText,
              { color: isSelected ? colors.textOnPrimary : colors.primary },
            ]}
          >
            {index + 1}
          </Text>
        </View>
        <Text style={[styles.slugPreview, { color: colors.text }]} numberOfLines={1}>
          {shot.slug || 'Untitled shot'}
        </Text>
        <View
          style={[styles.statusPill, { backgroundColor: colors.accentMuted }]}
          accessibilityLabel={`Shot ${index + 1} status ${STATUS_LABELS[shot.status]}`}
        >
          <Text style={[styles.statusPillText, { color: colors.accent }]}>
            {STATUS_LABELS[shot.status]}
          </Text>
        </View>
      </TouchableOpacity>

      {thumbnail !== null && (
        <Image
          source={{ uri: thumbnail }}
          style={styles.thumbnail}
          resizeMode="cover"
          accessibilityLabel={`Keyframe for shot ${index + 1}`}
        />
      )}

      <GrowingTextInput
        style={[
          styles.input,
          styles.inputMulti,
          {
            backgroundColor: colors.inputBg,
            borderColor: colors.borderLight,
            color: colors.text,
          },
        ]}
        value={shot.action}
        onChangeText={handleAction}
        placeholder="What we see in this shot"
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel={`Shot ${index + 1} action`}
      />

      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.inputBg,
            borderColor: colors.borderLight,
            color: colors.text,
          },
        ]}
        value={shot.slug ?? ''}
        onChangeText={handleSlug}
        placeholder="Label, e.g. Lighthouse at dusk"
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel={`Shot ${index + 1} slug`}
      />

      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.inputBg,
            borderColor: colors.borderLight,
            color: colors.text,
          },
        ]}
        value={shot.motion ?? ''}
        onChangeText={handleMotion}
        placeholder="Motion, e.g. slow push in"
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel={`Shot ${index + 1} motion`}
      />

      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.inputBg,
            borderColor: colors.borderLight,
            color: colors.text,
          },
        ]}
        value={
          shot.duration_seconds === undefined ? '' : String(shot.duration_seconds)
        }
        onChangeText={handleDuration}
        placeholder="Duration in seconds"
        placeholderTextColor={colors.textTertiary}
        keyboardType="numeric"
        accessibilityLabel={`Shot ${index + 1} duration in seconds`}
      />

      <View style={styles.cardActions}>
        <TouchableOpacity
          onPress={handleMoveUp}
          activeOpacity={0.7}
          disabled={index === 0}
          accessibilityRole="button"
          accessibilityLabel={`Move shot ${index + 1} up`}
          accessibilityState={{ disabled: index === 0 }}
          hitSlop={ICON_HIT_SLOP}
          style={styles.iconButton}
        >
          <Ionicons
            name="arrow-up-outline"
            size={18}
            color={index === 0 ? colors.textTertiary : colors.text}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleMoveDown}
          activeOpacity={0.7}
          disabled={isLast}
          accessibilityRole="button"
          accessibilityLabel={`Move shot ${index + 1} down`}
          accessibilityState={{ disabled: isLast }}
          hitSlop={ICON_HIT_SLOP}
          style={styles.iconButton}
        >
          <Ionicons
            name="arrow-down-outline"
            size={18}
            color={isLast ? colors.textTertiary : colors.text}
          />
        </TouchableOpacity>
        <View style={styles.spacer} />
        <TouchableOpacity
          onPress={handleRemove}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Delete shot ${index + 1}`}
          hitSlop={ICON_HIT_SLOP}
          style={styles.iconButton}
        >
          <Ionicons name="trash-outline" size={18} color={colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default function StoryboardEditorScreen({ navigation, route }: Props) {
  const { id, name: initialName } = route.params;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const store = documentStore<StoryboardDocument>('storyboard', id);
  const { doc, name, dirty, status, error } = store(
    useShallow((state) => ({
      doc: state.doc,
      name: state.name,
      dirty: state.dirty,
      status: state.status,
      error: state.error,
    }))
  );

  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  // The agent handler runs outside React, so it reads selection from a ref.
  const selectedRef = useRef<string | null>(null);
  const select = useCallback((next: string | null) => {
    selectedRef.current = next;
    setSelectedShotId(next);
  }, []);

  // The store's actions live in its state, so every caller goes through
  // getState() — including the agent handler, which runs outside React.
  const edit = useCallback(
    (mutate: (board: StoryboardDocument) => StoryboardDocument) => {
      store.getState().edit(mutate);
    },
    [store]
  );
  const runLoad = useCallback(() => void store.getState().load(), [store]);
  const runSave = useCallback(() => store.getState().save(), [store]);
  const runRevert = useCallback(() => void store.getState().revert(), [store]);

  useEffect(() => {
    // Re-read on every open. The store is cached for the app's lifetime, so a
    // board reopened after a rename elsewhere would otherwise render the old
    // name and save against a revision the server has already moved past.
    // Unsaved local edits are the one thing worth keeping over a fresh read.
    if (!store.getState().dirty) {
      runLoad();
    }
  }, [store, runLoad]);

  // ── Agent handler ────────────────────────────────────────────────────────
  useEffect(() => {
    const requireDoc = (): StoryboardDocument => {
      const current = store.getState().doc;
      if (current === null) {
        throw new Error(
          `Storyboard "${id}" has not finished loading. Retry in a moment.`
        );
      }
      return current;
    };

    const snapshot = (): StoryboardSnapshot => {
      const state = store.getState();
      const board = state.doc;
      return {
        boardId: id,
        title: state.name || initialName || 'Untitled storyboard',
        brief: board?.brief ?? '',
        style: board?.style ?? '',
        aspectRatio: board?.aspectRatio ?? DEFAULT_ASPECT_RATIO,
        hasScreenplay: board?.screenplay != null,
        selectedShotId: selectedRef.current,
        shots: (board?.shots ?? []).map(shotToNode),
      };
    };

    const writeShots = (shots: Shot[]): void => {
      edit((board) => ({ ...board, shots: reindexShots(shots) }));
    };

    const handler: StoryboardAgentHandler = {
      getSnapshot: snapshot,

      addShot: (input: StoryboardAddShotInput): StoryboardShotNode => {
        const shots = requireDoc().shots;
        const at =
          input.index === undefined
            ? shots.length
            : clamp(Math.trunc(input.index), 0, shots.length);
        const shot: Shot = {
          type: 'shot',
          id: newShotId(),
          index: at,
          action: input.action,
          camera: input.camera,
          motion: input.motion,
          duration_seconds: input.durationSeconds,
          status: 'planned',
        };
        writeShots([...shots.slice(0, at), shot, ...shots.slice(at)]);
        return shotToNode(shot, at);
      },

      updateShot: (
        target: string,
        patch: StoryboardUpdateShotPatch
      ): StoryboardShotNode => {
        const shots = requireDoc().shots;
        const at = resolveShotIndex(shots, target, selectedRef.current);
        const updated: Shot = {
          ...shots[at],
          action: patch.action ?? shots[at].action,
          camera: patch.camera ?? shots[at].camera,
          motion: patch.motion ?? shots[at].motion,
          slug: patch.slug ?? shots[at].slug,
          duration_seconds: patch.durationSeconds ?? shots[at].duration_seconds,
          status: patch.status ?? shots[at].status,
        };
        writeShots(shots.map((shot, index) => (index === at ? updated : shot)));
        return shotToNode(updated, at);
      },

      removeShot: (target: string): StoryboardShotNode => {
        const shots = requireDoc().shots;
        const at = resolveShotIndex(shots, target, selectedRef.current);
        const removed = shots[at];
        writeShots(shots.filter((_, index) => index !== at));
        if (selectedRef.current === removed.id) {
          select(null);
        }
        return shotToNode(removed, at);
      },

      reorderShot: (target: string, toIndex: number): StoryboardShotNode => {
        const shots = requireDoc().shots;
        const from = resolveShotIndex(shots, target, selectedRef.current);
        const rest = shots.filter((_, index) => index !== from);
        const to = clamp(Math.trunc(toIndex), 0, rest.length);
        const moved = shots[from];
        writeShots([...rest.slice(0, to), moved, ...rest.slice(to)]);
        return shotToNode(moved, to);
      },

      setBrief: (brief: string): StoryboardSnapshot => {
        requireDoc();
        edit((board) => ({ ...board, brief }));
        return snapshot();
      },

      setStyle: (style: string): StoryboardSnapshot => {
        requireDoc();
        edit((board) => ({ ...board, style }));
        return snapshot();
      },

      setAspectRatio: (aspectRatio: string): StoryboardSnapshot => {
        requireDoc();
        edit((board) => ({ ...board, aspectRatio }));
        return snapshot();
      },

      selectShot: (target: string | null): StoryboardShotNode | null => {
        if (target === null) {
          select(null);
          return null;
        }
        const shots = requireDoc().shots;
        const at = resolveShotIndex(shots, target, selectedRef.current);
        select(shots[at].id);
        return shotToNode(shots[at], at);
      },

      save: async (): Promise<{ ok: true; updatedAt: string | null }> => {
        await runSave();
        const state = store.getState();
        if (state.status === 'conflict' || state.status === 'error') {
          throw new Error(state.error ?? 'Failed to save the storyboard.');
        }
        return { ok: true, updatedAt: state.updatedAt };
      },
    };

    return registerDocumentHandler(
      'storyboard',
      id,
      store.getState().name || initialName || 'Storyboard',
      handler
    );
  }, [store, id, initialName, select, edit, runSave]);

  // Keep the id the agent addresses tied to the screen the user is looking at.
  // Claim focus on focus, but do not release it on blur. Navigating to Chat
  // blurs this screen, and the chat turn is the one moment `ui_context.focused`
  // is read — releasing here would tell the agent nothing is focused precisely
  // when the user is asking about this board. Unmount drops the registration,
  // which is what actually makes the claim stale.
  useFocusEffect(
    useCallback(() => {
      setFocusedDocument('storyboard', id);
    }, [id])
  );

  useEffect(() => {
    setUiSelection({ shotIds: selectedShotId ? [selectedShotId] : [] });
  }, [selectedShotId]);

  useEffect(() => () => clearUiSelection(), []);

  useEffect(() => {
    if (name) {
      setDocumentTitle('storyboard', id, name);
    }
  }, [name, id]);

  const handleSave = useCallback(() => {
    void runSave();
  }, [runSave]);

  const openChat = useCallback(() => {
    navigation.navigate('Chat');
  }, [navigation]);

  // The header lays the title out at its natural width and never shrinks it, so
  // a long board name runs under the actions and pushes Save off the screen.
  // Cap the title instead, leaving room for the actions and the back button.
  const { width: windowWidth } = useWindowDimensions();
  const titleMaxWidth = Math.max(96, windowWidth - HEADER_RESERVED_WIDTH);

  useLayoutEffect(() => {
    const saving = status === 'saving';
    navigation.setOptions({
      title: name || initialName || 'Storyboard',
      headerTitle: ({ children, tintColor }) => (
        <Text
          numberOfLines={1}
          style={[
            styles.headerTitle,
            { maxWidth: titleMaxWidth, color: tintColor ?? colors.text },
          ]}
        >
          {children}
        </Text>
      ),
      headerRight: () => (
        <EditorHeaderActions
          onChat={openChat}
          chatLabel="Direct this storyboard by chat"
          onSave={handleSave}
          saveLabel="Save storyboard"
          dirty={dirty}
          saving={saving}
        />
      ),
    });
  }, [
    navigation,
    name,
    initialName,
    dirty,
    status,
    colors.text,
    handleSave,
    openChat,
    titleMaxWidth,
  ]);

  // ── Local edits ──────────────────────────────────────────────────────────
  const patchShot = useCallback(
    (shotId: string, patch: Partial<Shot>) => {
      edit((board) => ({
        ...board,
        shots: board.shots.map((shot) =>
          shot.id === shotId ? { ...shot, ...patch } : shot
        ),
      }));
    },
    [edit]
  );

  const addShot = useCallback(() => {
    const shot: Shot = {
      type: 'shot',
      id: newShotId(),
      index: 0,
      action: '',
      status: 'planned',
    };
    edit((board) => ({
      ...board,
      shots: reindexShots([...board.shots, shot]),
    }));
    select(shot.id);
  }, [edit, select]);

  const removeShot = useCallback(
    (shotId: string) => {
      edit((board) => ({
        ...board,
        shots: reindexShots(board.shots.filter((shot) => shot.id !== shotId)),
      }));
      if (selectedRef.current === shotId) {
        select(null);
      }
    },
    [edit, select]
  );

  const moveShot = useCallback(
    (shotId: string, delta: number) => {
      edit((board) => {
        const from = board.shots.findIndex((shot) => shot.id === shotId);
        const to = from + delta;
        if (from < 0 || to < 0 || to >= board.shots.length) {
          return board;
        }
        const shots = [...board.shots];
        const [moved] = shots.splice(from, 1);
        shots.splice(to, 0, moved);
        return { ...board, shots: reindexShots(shots) };
      });
    },
    [edit]
  );

  if (doc === null) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        {status === 'error' ? (
          <>
            <Ionicons name="alert-circle-outline" size={36} color={colors.error} />
            <Text style={[styles.centerText, { color: colors.textSecondary }]}>
              {error ?? 'Failed to load this storyboard.'}
            </Text>
            <TouchableOpacity
              onPress={runLoad}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Retry loading storyboard"
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.primaryButtonText, { color: colors.textOnPrimary }]}>
                Retry
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <ActivityIndicator size="large" color={colors.primary} />
        )}
      </View>
    );
  }

  return (
    // Brief, style, and every shot are text fields, so the keyboard would
    // otherwise cover whichever one the user tapped in the lower half.
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <DocumentStatusBanner
        status={status}
        error={error}
        documentLabel="Storyboard"
        reloadNoun="storyboard"
        conflictNoun="storyboard"
        onReload={runRevert}
      />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.metaRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Board</Text>
          {dirty && (
            <View style={styles.dirtyRow} accessibilityLabel="Unsaved changes">
              <View style={[styles.dirtyDot, { backgroundColor: colors.warning }]} />
              <Text style={[styles.dirtyText, { color: colors.textSecondary }]}>
                Unsaved
              </Text>
            </View>
          )}
        </View>

        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Brief</Text>
        <GrowingTextInput
          style={[
            styles.input,
            styles.inputMulti,
            { backgroundColor: colors.inputBg, borderColor: colors.borderLight, color: colors.text },
          ]}
          value={doc.brief}
          onChangeText={(brief) => edit((board) => ({ ...board, brief }))}
          placeholder="What is this piece about?"
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="Board brief"
        />

        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Style</Text>
        <GrowingTextInput
          style={[
            styles.input,
            styles.inputMulti,
            { backgroundColor: colors.inputBg, borderColor: colors.borderLight, color: colors.text },
          ]}
          value={doc.style}
          onChangeText={(style) => edit((board) => ({ ...board, style }))}
          placeholder="Grainy 16mm, muted teal palette, low sun"
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="Board style"
        />

        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
          Aspect ratio
        </Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: colors.inputBg, borderColor: colors.borderLight, color: colors.text },
          ]}
          value={doc.aspectRatio}
          onChangeText={(aspectRatio) =>
            edit((board) => ({ ...board, aspectRatio }))
          }
          placeholder={DEFAULT_ASPECT_RATIO}
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Board aspect ratio"
        />

        <View style={styles.metaRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {`Shots (${doc.shots.length})`}
          </Text>
          <TouchableOpacity
            onPress={addShot}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add shot"
            style={styles.addButton}
          >
            <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
            <Text style={[styles.addButtonText, { color: colors.primary }]}>Add</Text>
          </TouchableOpacity>
        </View>

        {doc.shots.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="albums-outline" size={36} color={colors.textTertiary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No shots yet. Shots are usually created by asking the assistant to
              break your brief into a shot list — then fix them up here.
            </Text>
            <TouchableOpacity
              onPress={openChat}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Ask the assistant"
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.primaryButtonText, { color: colors.textOnPrimary }]}>
                Ask the assistant
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          doc.shots.map((shot, index) => (
            <ShotCard
              key={shot.id}
              shot={shot}
              index={index}
              isLast={index === doc.shots.length - 1}
              isSelected={shot.id === selectedShotId}
              onSelect={select}
              onPatch={patchShot}
              onMove={moveShot}
              onRemove={removeShot}
            />
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  centerText: { fontSize: 14, textAlign: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  scroll: { padding: 16 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 4,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  dirtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dirtyDot: { width: 8, height: 8, borderRadius: 4 },
  dirtyText: { fontSize: 12, fontWeight: '600' },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  inputMulti: { minHeight: MULTILINE_MIN_HEIGHT, textAlignVertical: 'top' },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addButtonText: { fontSize: 15, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  primaryButton: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  primaryButtonText: { fontSize: 15, fontWeight: '600' },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginTop: 10,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  indexBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexBadgeText: { fontSize: 13, fontWeight: '700' },
  slugPreview: { flex: 1, fontSize: 15, fontWeight: '600' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusPillText: { fontSize: 11, fontWeight: '600' },
  thumbnail: { width: '100%', height: 150, borderRadius: 10, marginBottom: 10 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  iconButton: { padding: 10 },
  spacer: { flex: 1 },
});
