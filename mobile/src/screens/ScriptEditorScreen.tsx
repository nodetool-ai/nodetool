/**
 * Script editor.
 *
 * The phone half of the script surface: read a script, write its cast, sections,
 * and lines, reorder, save. Voicing lines with TTS, exporting subtitles, and
 * assembling takes into a timeline stay on the desktop app — those are long, paid
 * jobs a phone screen cannot supervise — so this screen is a text editor that
 * shows, but never touches, the audio history each line carries.
 *
 * It is also the agent's hands on the script. The handler registered here mutates
 * the same `documentStore` the render reads, so a `ui_script_*` call repaints the
 * screen the user is holding, and `ui_script_save` is the same code path as the
 * Save button.
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
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

import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../hooks/useTheme';
import EditorHeaderActions from '../components/EditorHeaderActions';
import { documentStore } from '../documents/documentStore';
import {
  registerDocumentHandler,
  setDocumentTitle,
  setFocusedDocument,
} from '../documents/agentBridge';
import {
  applyLinePatch,
  clamp,
  emptyLine,
  flattenLines,
  lineStatus,
  lineToNode,
  newSectionId,
  newSpeakerId,
  replaceLine,
  resolveLine,
  resolveSectionIndex,
  resolveSpeakerIndex,
  sectionToNode,
  speakerToNode,
  withoutSpeaker,
  type ScriptAddLineInput,
  type ScriptAgentHandler,
  type ScriptDocument,
  type ScriptLine,
  type ScriptLineFields,
  type ScriptLineNode,
  type ScriptLinePatch,
  type ScriptLineStatus,
  type ScriptSection,
  type ScriptSectionNode,
  type ScriptSpeakerNode,
  type ScriptSnapshot,
} from '../documents/scriptTypes';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ScriptEditor'>;
  route: RouteProp<RootStackParamList, 'ScriptEditor'>;
};

const STATUS_LABELS = {
  draft: 'Draft',
  voiced: 'Voiced',
  stale: 'Stale',
} satisfies Record<ScriptLineStatus, string>;

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
 * web it is a `textarea` that never resizes — so a line long enough to wrap
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

interface LineCardProps {
  line: ScriptLine;
  index: number;
  isLast: boolean;
  isSelected: boolean;
  speakerName: string | undefined;
  speakerColor: string | undefined;
  onSelect: (lineId: string | null) => void;
  onPatch: (lineId: string, patch: ScriptLineFields) => void;
  onMove: (lineId: string, delta: number) => void;
  onRemove: (lineId: string) => void;
}

/**
 * `patchLine` rebuilds only the line it edits and hands back every other line
 * object unchanged, so memoizing here turns a keystroke from a repaint of the
 * whole script into a repaint of one card. That only holds while the handlers
 * stay stable — bind them per line here, not at the call site.
 */
const LineCard = React.memo(function LineCard({
  line,
  index,
  isLast,
  isSelected,
  speakerName,
  speakerColor,
  onSelect,
  onPatch,
  onMove,
  onRemove,
}: LineCardProps) {
  const { colors, shadows } = useTheme();
  const derived = lineStatus(line);

  const handleSelect = useCallback(
    () => onSelect(isSelected ? null : line.id),
    [onSelect, isSelected, line.id]
  );
  const handleText = useCallback(
    (text: string) => onPatch(line.id, { text }),
    [onPatch, line.id]
  );
  const handleDirection = useCallback(
    (direction: string) => onPatch(line.id, { direction }),
    [onPatch, line.id]
  );
  const handleMoveUp = useCallback(() => onMove(line.id, -1), [onMove, line.id]);
  const handleMoveDown = useCallback(() => onMove(line.id, 1), [onMove, line.id]);
  const handleRemove = useCallback(() => onRemove(line.id), [onRemove, line.id]);

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
        accessibilityLabel={`Select line ${index + 1}`}
        accessibilityState={{ selected: isSelected }}
        style={styles.cardHeader}
      >
        <View
          style={[
            styles.colorChip,
            { backgroundColor: speakerColor || colors.primaryMuted },
          ]}
        />
        <Text style={[styles.speakerName, { color: colors.text }]} numberOfLines={1}>
          {speakerName || 'Unassigned'}
        </Text>
        <View
          style={[styles.statusPill, { backgroundColor: colors.accentMuted }]}
          accessibilityLabel={`Line ${index + 1} status ${STATUS_LABELS[derived]}, ${line.takes.length} takes`}
        >
          <Text style={[styles.statusPillText, { color: colors.accent }]}>
            {line.takes.length > 0
              ? `${STATUS_LABELS[derived]} · ${line.takes.length}`
              : STATUS_LABELS[derived]}
          </Text>
        </View>
      </TouchableOpacity>

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
        value={line.text}
        onChangeText={handleText}
        placeholder="What is said"
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel={`Line ${index + 1} text`}
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
        value={line.direction ?? ''}
        onChangeText={handleDirection}
        placeholder="Direction, e.g. whispering, tired"
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel={`Line ${index + 1} direction`}
      />

      <View style={styles.cardActions}>
        <TouchableOpacity
          onPress={handleMoveUp}
          activeOpacity={0.7}
          disabled={index === 0}
          accessibilityRole="button"
          accessibilityLabel={`Move line ${index + 1} up`}
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
          accessibilityLabel={`Move line ${index + 1} down`}
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
          accessibilityLabel={`Delete line ${index + 1}`}
          hitSlop={ICON_HIT_SLOP}
          style={styles.iconButton}
        >
          <Ionicons name="trash-outline" size={18} color={colors.error} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default function ScriptEditorScreen({ navigation, route }: Props) {
  const { id, name: initialName } = route.params;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const store = documentStore<ScriptDocument>('script', id);
  const { doc, name, dirty, status, error } = store(
    useShallow((state) => ({
      doc: state.doc,
      name: state.name,
      dirty: state.dirty,
      status: state.status,
      error: state.error,
    }))
  );

  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  // The agent handler runs outside React, so it reads selection from a ref.
  const selectedRef = useRef<string | null>(null);
  const select = useCallback((next: string | null) => {
    selectedRef.current = next;
    setSelectedLineId(next);
  }, []);

  // The store's actions live in its state, so every caller goes through
  // getState() — including the agent handler, which runs outside React.
  const edit = useCallback(
    (mutate: (script: ScriptDocument) => ScriptDocument) => {
      store.getState().edit(mutate);
    },
    [store]
  );
  const runLoad = useCallback(() => void store.getState().load(), [store]);
  const runSave = useCallback(() => store.getState().save(), [store]);
  const runRevert = useCallback(() => void store.getState().revert(), [store]);

  useEffect(() => {
    // Re-read on every open. The store is cached for the app's lifetime, so a
    // script reopened after an edit elsewhere would otherwise render stale text
    // and save against an `updatedAt` the server has already moved past.
    // Unsaved local edits are the one thing worth keeping over a fresh read.
    if (!store.getState().dirty) {
      runLoad();
    }
  }, [store, runLoad]);

  // ── Agent handler ────────────────────────────────────────────────────────
  useEffect(() => {
    const requireDoc = (): ScriptDocument => {
      const current = store.getState().doc;
      if (current === null) {
        throw new Error(
          `Script "${id}" has not finished loading. Retry in a moment.`
        );
      }
      return current;
    };

    const snapshot = (): ScriptSnapshot => {
      const state = store.getState();
      const script = state.doc;
      return {
        scriptId: id,
        title: state.name || initialName || 'Untitled script',
        cast: (script?.cast ?? []).map(speakerToNode),
        sections: (script?.sections ?? []).map(sectionToNode),
        lines: script
          ? flattenLines(script).map((entry) =>
              lineToNode(entry.line, entry.sectionId, entry.index, script.cast)
            )
          : [],
        selectedLineId: selectedRef.current,
      };
    };

    /** Re-read a line after an edit, so the returned node reflects the write. */
    const nodeFor = (lineId: string): ScriptLineNode => {
      const script = requireDoc();
      const entry = flattenLines(script).find((it) => it.line.id === lineId);
      if (!entry) {
        throw new Error(`Line "${lineId}" disappeared after the edit.`);
      }
      return lineToNode(entry.line, entry.sectionId, entry.index, script.cast);
    };

    const requireSpeaker = (script: ScriptDocument, speakerId: string): void => {
      if (!script.cast.some((speaker) => speaker.id === speakerId)) {
        const ids = script.cast.map((speaker) => speaker.id).join(', ');
        throw new Error(
          `No cast member "${speakerId}" exists. ` +
            (ids.length > 0
              ? `Speaker ids: ${ids}.`
              : 'Add one with ui_script_add_speaker first.')
        );
      }
    };

    const patchLineAt = (
      target: string,
      patch: ScriptLineFields
    ): ScriptLineNode => {
      const at = resolveLine(requireDoc(), target, selectedRef.current);
      const next = applyLinePatch(at.line, patch);
      edit((script) => replaceLine(script, at, next));
      return nodeFor(next.id);
    };

    const handler: ScriptAgentHandler = {
      getSnapshot: snapshot,

      addSpeaker: (speakerName: string, color?: string): ScriptSpeakerNode => {
        requireDoc();
        const speaker = { id: newSpeakerId(), name: speakerName, color };
        edit((script) => ({ ...script, cast: [...script.cast, speaker] }));
        return speakerToNode(speaker);
      },

      renameSpeaker: (target: string, speakerName: string): ScriptSpeakerNode => {
        const script = requireDoc();
        const at = resolveSpeakerIndex(script.cast, target);
        const updated = { ...script.cast[at], name: speakerName };
        edit((current) => ({
          ...current,
          cast: current.cast.map((speaker, index) =>
            index === at ? updated : speaker
          ),
        }));
        return speakerToNode(updated);
      },

      removeSpeaker: (target: string): ScriptSpeakerNode => {
        const script = requireDoc();
        const at = resolveSpeakerIndex(script.cast, target);
        const removed = script.cast[at];
        edit((current) => withoutSpeaker(current, removed.id));
        return speakerToNode(removed);
      },

      addSection: (title?: string, index?: number): ScriptSectionNode => {
        const sections = requireDoc().sections;
        const at =
          index === undefined
            ? sections.length
            : clamp(Math.trunc(index), 0, sections.length);
        const section: ScriptSection = { id: newSectionId(), title, lines: [] };
        edit((script) => ({
          ...script,
          sections: [
            ...script.sections.slice(0, at),
            section,
            ...script.sections.slice(at),
          ],
        }));
        return sectionToNode(section);
      },

      setSectionTitle: (target: string, title: string): ScriptSectionNode => {
        const script = requireDoc();
        const at = resolveSectionIndex(script.sections, target);
        const updated = { ...script.sections[at], title };
        edit((current) => ({
          ...current,
          sections: current.sections.map((section, index) =>
            index === at ? updated : section
          ),
        }));
        return sectionToNode(updated);
      },

      removeSection: (target: string): ScriptSectionNode => {
        const script = requireDoc();
        const at = resolveSectionIndex(script.sections, target);
        const removed = script.sections[at];
        edit((current) => ({
          ...current,
          sections: current.sections.filter((_, index) => index !== at),
        }));
        if (removed.lines.some((line) => line.id === selectedRef.current)) {
          select(null);
        }
        return sectionToNode(removed);
      },

      addLine: (input: ScriptAddLineInput): ScriptLineNode => {
        const script = requireDoc();
        if (input.speakerId !== undefined) {
          requireSpeaker(script, input.speakerId);
        }
        const line: ScriptLine = {
          ...emptyLine(input.text, input.speakerId ?? null),
          direction: input.direction,
        };

        // No section to write into: give the script one rather than refuse, so
        // an agent writing a fresh script does not need a setup call first.
        if (script.sections.length === 0) {
          const section: ScriptSection = {
            id: newSectionId(),
            lines: [line],
          };
          edit((current) => ({ ...current, sections: [section] }));
          return nodeFor(line.id);
        }

        const sectionIndex =
          input.sectionId === undefined
            ? script.sections.length - 1
            : resolveSectionIndex(script.sections, input.sectionId);
        const target = script.sections[sectionIndex];
        const at =
          input.index === undefined
            ? target.lines.length
            : clamp(Math.trunc(input.index), 0, target.lines.length);
        edit((current) => ({
          ...current,
          sections: current.sections.map((section, index) =>
            index === sectionIndex
              ? {
                  ...section,
                  lines: [
                    ...section.lines.slice(0, at),
                    line,
                    ...section.lines.slice(at),
                  ],
                }
              : section
          ),
        }));
        return nodeFor(line.id);
      },

      setLineText: (target: string, text: string): ScriptLineNode =>
        patchLineAt(target, { text }),

      setLineSpeaker: (
        target: string,
        speakerId: string | null
      ): ScriptLineNode => {
        if (speakerId !== null) {
          requireSpeaker(requireDoc(), speakerId);
        }
        return patchLineAt(target, { speakerId });
      },

      patchLine: (target: string, patch: ScriptLinePatch): ScriptLineNode =>
        patchLineAt(target, patch),

      removeLine: (target: string): ScriptLineNode => {
        const script = requireDoc();
        const at = resolveLine(script, target, selectedRef.current);
        const removed = lineToNode(at.line, at.sectionId, at.index, script.cast);
        edit((current) => ({
          ...current,
          sections: current.sections.map((section, index) =>
            index === at.sectionIndex
              ? {
                  ...section,
                  lines: section.lines.filter(
                    (line) => line.id !== at.line.id
                  ),
                }
              : section
          ),
        }));
        if (selectedRef.current === at.line.id) {
          select(null);
        }
        return removed;
      },

      moveLine: (target: string, toIndex: number): ScriptLineNode => {
        const script = requireDoc();
        const at = resolveLine(script, target, selectedRef.current);
        edit((current) => moveLineTo(current, at.line.id, toIndex));
        return nodeFor(at.line.id);
      },

      selectLine: (target: string | null): ScriptLineNode | null => {
        if (target === null) {
          select(null);
          return null;
        }
        const script = requireDoc();
        const at = resolveLine(script, target, selectedRef.current);
        select(at.line.id);
        return lineToNode(at.line, at.sectionId, at.index, script.cast);
      },

      save: async (): Promise<{ ok: true; updatedAt: string | null }> => {
        await runSave();
        const state = store.getState();
        if (state.status === 'conflict' || state.status === 'error') {
          throw new Error(state.error ?? 'Failed to save the script.');
        }
        return { ok: true, updatedAt: state.updatedAt };
      },
    };

    return registerDocumentHandler(
      'script',
      id,
      store.getState().name || initialName || 'Script',
      handler
    );
  }, [store, id, initialName, select, edit, runSave]);

  // Keep the id the agent addresses tied to the screen the user is looking at.
  // Claim focus on focus, but do not release it on blur. Navigating to Chat
  // blurs this screen, and the chat turn is the one moment `ui_context.focused`
  // is read — releasing here would tell the agent nothing is focused precisely
  // when the user is asking about this script. Unmount drops the registration,
  // which is what actually makes the claim stale.
  useFocusEffect(
    useCallback(() => {
      setFocusedDocument('script', id);
    }, [id])
  );

  // No `setUiSelection` call: that payload carries clip, shot, and layer ids,
  // none of which a line is. The selected line reaches the agent through the
  // script snapshot instead.

  useEffect(() => {
    if (name) {
      setDocumentTitle('script', id, name);
    }
  }, [name, id]);

  const handleSave = useCallback(() => {
    void runSave();
  }, [runSave]);

  const openChat = useCallback(() => {
    navigation.navigate('Chat');
  }, [navigation]);

  // The header lays the title out at its natural width and never shrinks it, so
  // a long script name runs under the actions and pushes Save off the screen.
  // Cap the title instead, leaving room for the actions and the back button.
  const { width: windowWidth } = useWindowDimensions();
  const titleMaxWidth = Math.max(96, windowWidth - HEADER_RESERVED_WIDTH);

  useLayoutEffect(() => {
    const saving = status === 'saving';
    navigation.setOptions({
      title: name || initialName || 'Script',
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
          chatLabel="Write this script by chat"
          onSave={handleSave}
          saveLabel="Save script"
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
  const patchLine = useCallback(
    (lineId: string, patch: ScriptLineFields) => {
      edit((script) => ({
        ...script,
        sections: script.sections.map((section) => ({
          ...section,
          lines: section.lines.map((line) =>
            line.id === lineId ? applyLinePatch(line, patch) : line
          ),
        })),
      }));
    },
    [edit]
  );

  const addLine = useCallback(
    (sectionId: string) => {
      const line = emptyLine();
      edit((script) => ({
        ...script,
        sections: script.sections.map((section) =>
          section.id === sectionId
            ? { ...section, lines: [...section.lines, line] }
            : section
        ),
      }));
      select(line.id);
    },
    [edit, select]
  );

  const removeLine = useCallback(
    (lineId: string) => {
      edit((script) => ({
        ...script,
        sections: script.sections.map((section) => ({
          ...section,
          lines: section.lines.filter((line) => line.id !== lineId),
        })),
      }));
      if (selectedRef.current === lineId) {
        select(null);
      }
    },
    [edit, select]
  );

  const moveLine = useCallback(
    (lineId: string, delta: number) => {
      edit((script) => {
        const entry = flattenLines(script).find((it) => it.line.id === lineId);
        if (!entry) {
          return script;
        }
        return moveLineTo(script, lineId, entry.index + delta);
      });
    },
    [edit]
  );

  const addSection = useCallback(() => {
    edit((script) => ({
      ...script,
      sections: [
        ...script.sections,
        { id: newSectionId(), title: '', lines: [] },
      ],
    }));
  }, [edit]);

  const removeSection = useCallback(
    (sectionId: string) => {
      edit((script) => ({
        ...script,
        sections: script.sections.filter((section) => section.id !== sectionId),
      }));
      select(null);
    },
    [edit, select]
  );

  const addSpeaker = useCallback(() => {
    edit((script) => ({
      ...script,
      cast: [
        ...script.cast,
        { id: newSpeakerId(), name: `Speaker ${script.cast.length + 1}` },
      ],
    }));
  }, [edit]);

  const renameSpeaker = useCallback(
    (speakerId: string, speakerName: string) => {
      edit((script) => ({
        ...script,
        cast: script.cast.map((speaker) =>
          speaker.id === speakerId ? { ...speaker, name: speakerName } : speaker
        ),
      }));
    },
    [edit]
  );

  const removeSpeaker = useCallback(
    (speakerId: string) => {
      edit((script) => withoutSpeaker(script, speakerId));
    },
    [edit]
  );

  const assignSpeaker = useCallback(
    (speakerId: string) => {
      const lineId = selectedRef.current;
      if (lineId === null) {
        return;
      }
      patchLine(lineId, { speakerId });
    },
    [patchLine]
  );

  if (doc === null) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        {status === 'error' ? (
          <>
            <Ionicons name="alert-circle-outline" size={36} color={colors.error} />
            <Text style={[styles.centerText, { color: colors.textSecondary }]}>
              {error ?? 'Failed to load this script.'}
            </Text>
            <TouchableOpacity
              onPress={runLoad}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Retry loading script"
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            >
              <Text
                style={[styles.primaryButtonText, { color: colors.textOnPrimary }]}
              >
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

  const flat = flattenLines(doc);
  const lineNumber = new Map(flat.map((entry) => [entry.line.id, entry.index]));
  // Looked up once per line below; a scan of the cast per line is O(lines × cast).
  const castById = new Map(doc.cast.map((member) => [member.id, member]));

  return (
    // Every line is a text field, so the keyboard would otherwise cover
    // whichever one the user tapped in the lower half of the screen.
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {status === 'conflict' && (
        <View
          style={[styles.banner, { backgroundColor: colors.warning + '22' }]}
          accessibilityLabel="Script changed elsewhere"
        >
          <Ionicons name="git-compare-outline" size={16} color={colors.warning} />
          <Text style={[styles.bannerText, { color: colors.text }]}>
            Someone else saved this script. Reload to get their version — your
            unsaved edits here will be lost.
          </Text>
          <TouchableOpacity
            onPress={runRevert}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Reload script"
            style={[styles.bannerButton, { backgroundColor: colors.warning }]}
          >
            <Text style={styles.bannerButtonText}>Reload</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'error' && error !== null && (
        <View style={[styles.banner, { backgroundColor: colors.error + '18' }]}>
          <Ionicons name="warning-outline" size={16} color={colors.error} />
          <Text style={[styles.bannerText, { color: colors.error }]}>{error}</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.metaRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {`Cast (${doc.cast.length})`}
          </Text>
          {dirty && (
            <View style={styles.dirtyRow} accessibilityLabel="Unsaved changes">
              <View style={[styles.dirtyDot, { backgroundColor: colors.warning }]} />
              <Text style={[styles.dirtyText, { color: colors.textSecondary }]}>
                Unsaved
              </Text>
            </View>
          )}
        </View>

        {doc.cast.map((speaker, index) => (
          <View key={speaker.id} style={styles.castRow}>
            <View
              style={[
                styles.colorChip,
                { backgroundColor: speaker.color || colors.primaryMuted },
              ]}
            />
            <TextInput
              style={[
                styles.input,
                styles.castInput,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.borderLight,
                  color: colors.text,
                },
              ]}
              value={speaker.name}
              onChangeText={(next) => renameSpeaker(speaker.id, next)}
              placeholder="Speaker name"
              placeholderTextColor={colors.textTertiary}
              accessibilityLabel={`Speaker ${index + 1} name`}
            />
            <TouchableOpacity
              onPress={() => assignSpeaker(speaker.id)}
              activeOpacity={0.7}
              disabled={selectedLineId === null}
              accessibilityRole="button"
              accessibilityLabel={`Assign ${speaker.name} to the selected line`}
              accessibilityState={{ disabled: selectedLineId === null }}
              hitSlop={ICON_HIT_SLOP}
              style={styles.iconButton}
            >
              <Ionicons
                name="person-add-outline"
                size={18}
                color={selectedLineId === null ? colors.textTertiary : colors.primary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => removeSpeaker(speaker.id)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Remove speaker ${index + 1}`}
              hitSlop={ICON_HIT_SLOP}
              style={styles.iconButton}
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity
          onPress={addSpeaker}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Add speaker"
          style={styles.addButton}
        >
          <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
          <Text style={[styles.addButtonText, { color: colors.primary }]}>
            Add speaker
          </Text>
        </TouchableOpacity>

        <View style={styles.metaRow}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {`Script (${flat.length} ${flat.length === 1 ? 'line' : 'lines'})`}
          </Text>
          <TouchableOpacity
            onPress={addSection}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add section"
            style={styles.addButton}
          >
            <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
            <Text style={[styles.addButtonText, { color: colors.primary }]}>
              Section
            </Text>
          </TouchableOpacity>
        </View>

        {doc.sections.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons
              name="document-text-outline"
              size={36}
              color={colors.textTertiary}
            />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No lines yet. Scripts are usually written by asking the assistant
              for the dialogue you want — then fix the wording here. Voicing them
              happens in the desktop app.
            </Text>
            <TouchableOpacity
              onPress={openChat}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Ask the assistant"
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            >
              <Text
                style={[styles.primaryButtonText, { color: colors.textOnPrimary }]}
              >
                Ask the assistant
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          doc.sections.map((section, sectionIndex) => (
            <View key={section.id} style={styles.sectionBlock}>
              <View style={styles.sectionHeader}>
                <TextInput
                  style={[
                    styles.input,
                    styles.sectionInput,
                    {
                      backgroundColor: colors.inputBg,
                      borderColor: colors.borderLight,
                      color: colors.text,
                    },
                  ]}
                  value={section.title ?? ''}
                  onChangeText={(title) =>
                    edit((script) => ({
                      ...script,
                      sections: script.sections.map((it) =>
                        it.id === section.id ? { ...it, title } : it
                      ),
                    }))
                  }
                  placeholder={`Section ${sectionIndex + 1} title`}
                  placeholderTextColor={colors.textTertiary}
                  accessibilityLabel={`Section ${sectionIndex + 1} title`}
                />
                <TouchableOpacity
                  onPress={() => removeSection(section.id)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete section ${sectionIndex + 1}`}
                  hitSlop={ICON_HIT_SLOP}
                  style={styles.iconButton}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>

              {section.lines.map((line) => {
                const index = lineNumber.get(line.id) ?? 0;
                const speaker = castById.get(line.speakerId ?? '');
                return (
                  <LineCard
                    key={line.id}
                    line={line}
                    index={index}
                    isLast={index === flat.length - 1}
                    isSelected={line.id === selectedLineId}
                    speakerName={speaker?.name}
                    speakerColor={speaker?.color}
                    onSelect={select}
                    onPatch={patchLine}
                    onMove={moveLine}
                    onRemove={removeLine}
                  />
                );
              })}

              <TouchableOpacity
                onPress={() => addLine(section.id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Add line to section ${sectionIndex + 1}`}
                style={styles.addButton}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={22}
                  color={colors.primary}
                />
                <Text style={[styles.addButtonText, { color: colors.primary }]}>
                  Add line
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * Move one line to a 0-based position counted across the whole script.
 *
 * Lines live inside sections, so the destination decides the section too: the
 * line lands in whichever section already owns the line now at that position.
 * The line object is carried across unchanged, which is what keeps its takes.
 */
function moveLineTo(
  script: ScriptDocument,
  lineId: string,
  toIndex: number
): ScriptDocument {
  const entries: Array<{ sectionIndex: number; line: ScriptLine }> = [];
  let moved: ScriptLine | undefined;
  for (let sectionIndex = 0; sectionIndex < script.sections.length; sectionIndex += 1) {
    for (const line of script.sections[sectionIndex].lines) {
      if (line.id === lineId) {
        moved = line;
      } else {
        entries.push({ sectionIndex, line });
      }
    }
  }
  if (moved === undefined) {
    return script;
  }

  const to = clamp(Math.trunc(toIndex), 0, entries.length);
  const sectionIndex =
    entries[to]?.sectionIndex ??
    entries[entries.length - 1]?.sectionIndex ??
    0;
  entries.splice(to, 0, { sectionIndex, line: moved });

  return {
    ...script,
    sections: script.sections.map((section, index) => ({
      ...section,
      lines: entries
        .filter((entry) => entry.sectionIndex === index)
        .map((entry) => entry.line),
    })),
  };
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  centerText: { fontSize: 14, textAlign: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  bannerText: { flex: 1, fontSize: 13 },
  bannerButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  bannerButtonText: { fontSize: 13, fontWeight: '600', color: '#fff' },
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
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  inputMulti: { minHeight: MULTILINE_MIN_HEIGHT, textAlignVertical: 'top' },
  castRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // `minWidth: 0` is what lets the field give way to the buttons beside it: a
  // web text input will not shrink past its default intrinsic width otherwise.
  castInput: { flex: 1, minWidth: 0, marginBottom: 0 },
  colorChip: { width: 14, height: 14, borderRadius: 7 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
  },
  addButtonText: { fontSize: 15, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  primaryButton: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  primaryButtonText: { fontSize: 15, fontWeight: '600' },
  sectionBlock: { marginTop: 14 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionInput: { flex: 1, minWidth: 0, marginBottom: 0, fontWeight: '600' },
  card: { borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 10 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  speakerName: { flex: 1, fontSize: 15, fontWeight: '600' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusPillText: { fontSize: 11, fontWeight: '600' },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  iconButton: { padding: 10 },
  spacer: { flex: 1 },
});
