/**
 * JS script editor.
 *
 * The phone half of the JS script surface: read a script, write its body,
 * declared ports and metadata, run it, and run its saved cases. The body only
 * ever executes in the server's QuickJS sandbox — `POST /api/js-scripts/:id/run`
 * runs the *saved* document, which is why every run here saves first.
 *
 * Two things the desktop editor has and this one does not: authoring test cases
 * (a case is a JSON bag per handle — typing one on a phone is worse than asking
 * the assistant for it, so the cases are shown and run but not edited) and
 * installing sandbox packs. Package declarations round-trip untouched.
 *
 * It is also the agent's hands on the script. The handler registered here
 * mutates the same `documentStore` the render reads, so a `ui_jsscript_*` call
 * repaints the screen the user is holding, and `ui_jsscript_run` is the same
 * code path as the Run button.
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';

import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../hooks/useTheme';
import { apiService } from '../services/api';
import { documentStore } from '../documents/documentStore';
import {
  registerDocumentHandler,
  setDocumentTitle,
  setFocusedDocument,
} from '../documents/agentBridge';
import {
  JS_SCRIPT_MAX_TIMEOUT_SECONDS,
  gradeJsScriptTests,
  normalizeJsScriptDocument,
  validateJsScriptDocument,
  type JsScriptAgentHandler,
  type JsScriptDocument,
  type JsScriptPort,
  type JsScriptRunOutcome,
  type JsScriptSnapshot,
  type JsScriptTestCase,
  type JsScriptTestReport,
} from '../documents/jsScriptTypes';
import { isString } from '../utils/typePredicates';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'JsScriptEditor'>;
  route: RouteProp<RootStackParamList, 'JsScriptEditor'>;
};

/** 18pt icon + 10pt padding = 38pt; the slop lifts it to the 46pt touch target. */
const ICON_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 };

/** Back button + chat bubble + Save + the gutters around them. */
const HEADER_RESERVED_WIDTH = 164;

const CODE_MIN_HEIGHT = 200;

const MONOSPACE = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

/** Pretty-print a value for one of the read-only result panes. */
const asText = (value: unknown): string => {
  if (isString(value)) {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    // Circular or otherwise unserializable: the sandbox returns plain data, so
    // this is the "should not happen" branch rather than a real case.
    return String(value);
  }
};

/**
 * Read one run-console field.
 *
 * The console is text fields, but a script's inputs are typed. Anything that
 * parses as JSON goes in as that value — numbers, booleans, arrays, objects —
 * and everything else goes in as the string the user typed, which is what makes
 * `hello` work without quotes.
 */
export function parseRunInput(raw: string) {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return '';
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return raw;
  }
}

export default function JsScriptEditorScreen({ navigation, route }: Props) {
  const { id, name: initialName } = route.params;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const store = documentStore<JsScriptDocument>('jsscript', id);
  const { doc, name, dirty, status, error } = store(
    useShallow((state) => ({
      doc: state.doc,
      name: state.name,
      dirty: state.dirty,
      status: state.status,
      error: state.error,
    }))
  );

  const [runInputs, setRunInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'run' | 'test' | null>(null);
  const [lastRun, setLastRun] = useState<JsScriptRunOutcome | null>(null);
  const [lastTest, setLastTest] = useState<JsScriptTestReport | null>(null);
  // The agent handler runs outside React, so it reads results from refs.
  const lastRunRef = useRef<JsScriptRunOutcome | null>(null);
  const lastTestRef = useRef<JsScriptTestReport | null>(null);

  // The store's actions live in its state, so every caller goes through
  // getState() — including the agent handler, which runs outside React.
  const edit = useCallback(
    (mutate: (script: JsScriptDocument) => JsScriptDocument) => {
      store.getState().edit(mutate);
    },
    [store]
  );
  const runLoad = useCallback(() => void store.getState().load(), [store]);
  const runRevert = useCallback(() => void store.getState().revert(), [store]);

  /** Save and turn a conflict or failure into a throw the caller can report. */
  const saveOrThrow = useCallback(async (): Promise<string | null> => {
    await store.getState().save();
    const state = store.getState();
    if (state.status === 'conflict' || state.status === 'error') {
      throw new Error(state.error ?? 'Failed to save the script.');
    }
    return state.updatedAt;
  }, [store]);

  useEffect(() => {
    // Re-read on every open. The store is cached for the app's lifetime, so a
    // script reopened after an edit elsewhere would otherwise render a stale
    // body and save against an `updatedAt` the server has already moved past.
    if (!store.getState().dirty) {
      runLoad();
    }
  }, [store, runLoad]);

  // ── Run and test ─────────────────────────────────────────────────────────
  const runScript = useCallback(
    async (
      inputs: Record<string, unknown>,
      inputStreams?: Record<string, unknown[]>
    ): Promise<JsScriptRunOutcome> => {
      // The endpoint executes the saved row, so an unsaved edit would run the
      // previous body and report a result the user never asked for.
      await saveOrThrow();
      const outcome = await apiService.runJsScript(id, inputs, inputStreams);
      lastRunRef.current = outcome;
      setLastRun(outcome);
      return outcome;
    },
    [id, saveOrThrow]
  );

  const testScript = useCallback(async (): Promise<JsScriptTestReport> => {
    const tests = store.getState().doc?.tests ?? [];
    if (tests.length === 0) {
      throw new Error(
        'This script has no saved test cases. Add them with ui_jsscript_set_tests first.'
      );
    }
    await saveOrThrow();
    const report = await gradeJsScriptTests(tests, (inputs, inputStreams) =>
      apiService.runJsScript(id, inputs, inputStreams)
    );
    lastTestRef.current = report;
    setLastTest(report);
    return report;
  }, [id, store, saveOrThrow]);

  // ── Agent handler ────────────────────────────────────────────────────────
  useEffect(() => {
    const requireDoc = (): JsScriptDocument => {
      const current = store.getState().doc;
      if (current === null) {
        throw new Error(
          `JS script "${id}" has not finished loading. Retry in a moment.`
        );
      }
      return current;
    };

    const snapshot = (): JsScriptSnapshot => {
      const state = store.getState();
      const document = normalizeJsScriptDocument(state.doc);
      return {
        scriptId: id,
        name: state.name || initialName || 'Untitled JS script',
        document,
        issues: validateJsScriptDocument(document),
        lastRun: lastRunRef.current,
        lastTest: lastTestRef.current,
      };
    };

    const write = (
      mutate: (script: JsScriptDocument) => JsScriptDocument
    ): JsScriptSnapshot => {
      requireDoc();
      edit(mutate);
      return snapshot();
    };

    const handler: JsScriptAgentHandler = {
      getSnapshot: snapshot,

      setCode: (code: string) => write((script) => ({ ...script, code })),

      setPorts: ({ inputs, outputs }) =>
        write((script) => {
          const next = { ...script };
          if (inputs) {
            next.inputs = inputs;
          }
          if (outputs) {
            next.outputs = outputs;
          }
          return next;
        }),

      setMeta: ({ name: nextName, description, secrets, timeoutSeconds }) => {
        requireDoc();
        if (nextName !== undefined) {
          store.getState().rename(nextName);
        }
        if (
          description !== undefined ||
          secrets !== undefined ||
          timeoutSeconds !== undefined
        ) {
          edit((script) => {
            const next = { ...script };
            if (description !== undefined) {
              next.description = description;
            }
            if (secrets !== undefined) {
              next.secrets = secrets;
            }
            if (timeoutSeconds !== undefined) {
              next.timeoutSeconds = timeoutSeconds;
            }
            return next;
          });
        }
        return snapshot();
      },

      setTests: (tests: JsScriptTestCase[]) =>
        write((script) => ({ ...script, tests })),

      save: async () => {
        const updatedAt = await saveOrThrow();
        return { ok: true, updatedAt };
      },

      run: runScript,
      test: testScript,
    };

    return registerDocumentHandler(
      'jsscript',
      id,
      store.getState().name || initialName || 'JS script',
      handler
    );
  }, [store, id, initialName, edit, saveOrThrow, runScript, testScript]);

  // Claim focus on focus, but do not release it on blur: navigating to Chat
  // blurs this screen, and the chat turn is the one moment `ui_context.focused`
  // is read. Unmount drops the registration, which is what makes it stale.
  useFocusEffect(
    useCallback(() => {
      setFocusedDocument('jsscript', id);
    }, [id])
  );

  useEffect(() => {
    if (name) {
      setDocumentTitle('jsscript', id, name);
    }
  }, [name, id]);

  const handleSave = useCallback(() => {
    void store.getState().save();
  }, [store]);

  const openChat = useCallback(() => {
    navigation.navigate('Chat');
  }, [navigation]);

  const [actionError, setActionError] = useState<string | null>(null);

  const handleRun = useCallback(() => {
    const declared = store.getState().doc?.inputs ?? [];
    const inputs: Record<string, unknown> = {};
    for (const port of declared) {
      inputs[port.name] = parseRunInput(runInputs[port.name] ?? '');
    }
    setActionError(null);
    setBusy('run');
    void runScript(inputs)
      .catch((runError: unknown) => {
        setActionError(
          runError instanceof Error ? runError.message : 'The run failed.'
        );
      })
      .finally(() => setBusy(null));
  }, [store, runInputs, runScript]);

  const handleTest = useCallback(() => {
    setActionError(null);
    setBusy('test');
    void testScript()
      .catch((testError: unknown) => {
        setActionError(
          testError instanceof Error ? testError.message : 'The tests failed to run.'
        );
      })
      .finally(() => setBusy(null));
  }, [testScript]);

  // The header lays the title out at its natural width and never shrinks it, so
  // a long name would push Save off the screen. Cap the title instead.
  const { width: windowWidth } = useWindowDimensions();
  const titleMaxWidth = Math.max(96, windowWidth - HEADER_RESERVED_WIDTH);

  useLayoutEffect(() => {
    const saving = status === 'saving';
    navigation.setOptions({
      title: name || initialName || 'JS script',
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
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={openChat}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Write this script by chat"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={22}
              color={colors.primary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            activeOpacity={0.7}
            disabled={!dirty || saving}
            accessibilityRole="button"
            accessibilityLabel="Save JS script"
            accessibilityState={{ disabled: !dirty || saving }}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text
                style={[
                  styles.saveText,
                  { color: dirty ? colors.primary : colors.textTertiary },
                ]}
              >
                Save
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ),
    });
  }, [
    navigation,
    name,
    initialName,
    dirty,
    status,
    colors.primary,
    colors.text,
    colors.textTertiary,
    handleSave,
    openChat,
    titleMaxWidth,
  ]);

  // ── Local edits ──────────────────────────────────────────────────────────
  const patchPort = useCallback(
    (side: 'inputs' | 'outputs', index: number, patch: Partial<JsScriptPort>) => {
      edit((script) => ({
        ...script,
        [side]: script[side].map((port, at) =>
          at === index ? { ...port, ...patch } : port
        ),
      }));
    },
    [edit]
  );

  const addPort = useCallback(
    (side: 'inputs' | 'outputs') => {
      edit((script) => ({
        ...script,
        [side]: [
          ...script[side],
          { name: `${side === 'inputs' ? 'input' : 'output'}${script[side].length + 1}`, type: 'str' },
        ],
      }));
    },
    [edit]
  );

  const removePort = useCallback(
    (side: 'inputs' | 'outputs', index: number) => {
      edit((script) => ({
        ...script,
        [side]: script[side].filter((_, at) => at !== index),
      }));
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
              {error ?? 'Failed to load this JS script.'}
            </Text>
            <TouchableOpacity
              onPress={runLoad}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Retry loading JS script"
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

  const script = normalizeJsScriptDocument(doc);
  const issues = validateJsScriptDocument(script);
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');

  const portSection = (side: 'inputs' | 'outputs', label: string) => (
    <>
      <View style={styles.metaRow}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {`${label} (${script[side].length})`}
        </Text>
        <TouchableOpacity
          onPress={() => addPort(side)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Add ${label.toLowerCase().slice(0, -1)}`}
          style={styles.addButton}
        >
          <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
          <Text style={[styles.addButtonText, { color: colors.primary }]}>Add</Text>
        </TouchableOpacity>
      </View>
      {script[side].map((port, index) => (
        <View key={`${side}-${index}`} style={styles.portRow}>
          <TextInput
            style={[
              styles.input,
              styles.portName,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.borderLight,
                color: colors.text,
              },
            ]}
            value={port.name}
            onChangeText={(next) => patchPort(side, index, { name: next })}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="name"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel={`${label} ${index + 1} name`}
          />
          <TextInput
            style={[
              styles.input,
              styles.portType,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.borderLight,
                color: colors.text,
              },
            ]}
            value={port.type}
            onChangeText={(next) => patchPort(side, index, { type: next })}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="str"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel={`${label} ${index + 1} type`}
          />
          <TouchableOpacity
            onPress={() => removePort(side, index)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${label.toLowerCase().slice(0, -1)} ${index + 1}`}
            hitSlop={ICON_HIT_SLOP}
            style={styles.iconButton}
          >
            <Ionicons name="trash-outline" size={18} color={colors.error} />
          </TouchableOpacity>
        </View>
      ))}
    </>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {status === 'conflict' && (
        <View
          style={[styles.banner, { backgroundColor: colors.warning + '22' }]}
          accessibilityLabel="JS script changed elsewhere"
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
            accessibilityLabel="Reload JS script"
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
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Body</Text>
          {dirty && (
            <View style={styles.dirtyRow} accessibilityLabel="Unsaved changes">
              <View style={[styles.dirtyDot, { backgroundColor: colors.warning }]} />
              <Text style={[styles.dirtyText, { color: colors.textSecondary }]}>
                Unsaved
              </Text>
            </View>
          )}
        </View>

        <TextInput
          style={[
            styles.input,
            styles.code,
            {
              backgroundColor: colors.inputBg,
              borderColor: colors.borderLight,
              color: colors.text,
            },
          ]}
          value={script.code}
          onChangeText={(code) => edit((current) => ({ ...current, code }))}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          placeholder={'const total = inputs.numbers.reduce((a, b) => a + b, 0);\nawait output("total", total);'}
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="Script body"
        />

        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Top-level statements only. Inputs arrive on `inputs.name`; results
          leave through `await output(name, value)` or `await emit(name, value)`,
          never through `return`.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Description
        </Text>
        <TextInput
          style={[
            styles.input,
            styles.description,
            {
              backgroundColor: colors.inputBg,
              borderColor: colors.borderLight,
              color: colors.text,
            },
          ]}
          value={script.description}
          onChangeText={(description) =>
            edit((current) => ({ ...current, description }))
          }
          multiline
          placeholder="What this script does — how an agent picks it out of a list."
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="Script description"
        />

        {portSection('inputs', 'Inputs')}
        {portSection('outputs', 'Outputs')}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Settings</Text>
        <View style={styles.settingRow}>
          <Text style={[styles.settingLabel, { color: colors.textSecondary }]}>
            Timeout (s)
          </Text>
          <TextInput
            style={[
              styles.input,
              styles.timeoutInput,
              {
                backgroundColor: colors.inputBg,
                borderColor: colors.borderLight,
                color: colors.text,
              },
            ]}
            value={String(script.timeoutSeconds)}
            onChangeText={(next) => {
              const seconds = Number.parseInt(next, 10);
              edit((current) => ({
                ...current,
                timeoutSeconds: Number.isNaN(seconds)
                  ? 0
                  : Math.min(seconds, JS_SCRIPT_MAX_TIMEOUT_SECONDS),
              }));
            }}
            keyboardType="number-pad"
            accessibilityLabel="Run timeout in seconds"
          />
        </View>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.inputBg,
              borderColor: colors.borderLight,
              color: colors.text,
            },
          ]}
          value={script.secrets.join(', ')}
          onChangeText={(next) =>
            edit((current) => ({
              ...current,
              secrets: next
                .split(',')
                .map((secret) => secret.trim())
                .filter((secret) => secret.length > 0),
            }))
          }
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="Secret names the body may read, comma separated"
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel="Declared secrets"
        />

        {issues.length > 0 && (
          <View
            style={[
              styles.issues,
              {
                backgroundColor:
                  (errors.length > 0 ? colors.error : colors.warning) + '14',
              },
            ]}
            accessibilityLabel="Validation issues"
          >
            {[...errors, ...warnings].map((issue, index) => (
              <View key={`${issue.code}-${index}`} style={styles.issueRow}>
                <Ionicons
                  name={
                    issue.severity === 'error'
                      ? 'close-circle-outline'
                      : 'alert-circle-outline'
                  }
                  size={15}
                  color={issue.severity === 'error' ? colors.error : colors.warning}
                />
                <Text style={[styles.issueText, { color: colors.textSecondary }]}>
                  {issue.message}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Run</Text>
        {script.inputs.length === 0 ? (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            No declared inputs — the body runs with an empty bag.
          </Text>
        ) : (
          script.inputs.map((port) => (
            <View key={`run-${port.name}`} style={styles.settingRow}>
              <Text
                style={[styles.settingLabel, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {`${port.name}: ${port.type}`}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  styles.runInput,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.borderLight,
                    color: colors.text,
                  },
                ]}
                value={runInputs[port.name] ?? ''}
                onChangeText={(next) =>
                  setRunInputs((current) => ({ ...current, [port.name]: next }))
                }
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="JSON, or plain text"
                placeholderTextColor={colors.textTertiary}
                accessibilityLabel={`Value for input ${port.name}`}
              />
            </View>
          ))
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            onPress={handleRun}
            activeOpacity={0.7}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel="Run script"
            accessibilityState={{ disabled: busy !== null }}
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
          >
            {busy === 'run' ? (
              <ActivityIndicator size="small" color={colors.textOnPrimary} />
            ) : (
              <Text
                style={[styles.primaryButtonText, { color: colors.textOnPrimary }]}
              >
                Run
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleTest}
            activeOpacity={0.7}
            disabled={busy !== null || script.tests.length === 0}
            accessibilityRole="button"
            accessibilityLabel="Run saved test cases"
            accessibilityState={{
              disabled: busy !== null || script.tests.length === 0,
            }}
            style={[
              styles.secondaryButton,
              { borderColor: colors.borderLight },
            ]}
          >
            {busy === 'test' ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text
                style={[
                  styles.primaryButtonText,
                  {
                    color:
                      script.tests.length === 0
                        ? colors.textTertiary
                        : colors.primary,
                  },
                ]}
              >
                {`Test (${script.tests.length})`}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {actionError !== null && (
          <Text style={[styles.issueText, { color: colors.error }]}>
            {actionError}
          </Text>
        )}

        {lastRun !== null && (
          <View
            style={[styles.card, { borderColor: colors.borderLight }]}
            accessibilityLabel="Last run result"
          >
            <View style={styles.cardHeader}>
              <Ionicons
                name={lastRun.ok ? 'checkmark-circle' : 'close-circle'}
                size={18}
                color={lastRun.ok ? colors.success : colors.error}
              />
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {lastRun.ok ? 'Run succeeded' : 'Run failed'}
              </Text>
              <Text style={[styles.dirtyText, { color: colors.textSecondary }]}>
                {`${lastRun.duration_ms} ms`}
              </Text>
            </View>
            {lastRun.error !== undefined && (
              <Text style={[styles.mono, { color: colors.error }]}>
                {lastRun.error}
              </Text>
            )}
            {lastRun.outputs !== undefined && (
              <Text style={[styles.mono, { color: colors.text }]}>
                {asText(lastRun.outputs)}
              </Text>
            )}
            {lastRun.streamed !== undefined && lastRun.streamed.length > 0 && (
              <Text style={[styles.mono, { color: colors.textSecondary }]}>
                {asText(lastRun.streamed)}
              </Text>
            )}
            {lastRun.logs.length > 0 && (
              <Text style={[styles.mono, { color: colors.textSecondary }]}>
                {lastRun.logs.join('\n')}
              </Text>
            )}
          </View>
        )}

        {lastTest !== null && (
          <View
            style={[styles.card, { borderColor: colors.borderLight }]}
            accessibilityLabel="Last test report"
          >
            <View style={styles.cardHeader}>
              <Ionicons
                name={lastTest.failed === 0 ? 'checkmark-circle' : 'close-circle'}
                size={18}
                color={lastTest.failed === 0 ? colors.success : colors.error}
              />
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                {`${lastTest.passed} passed, ${lastTest.failed} failed`}
              </Text>
            </View>
            {lastTest.cases.map((report) => (
              <View key={report.name} style={styles.caseRow}>
                <Ionicons
                  name={report.ok ? 'checkmark' : 'close'}
                  size={15}
                  color={report.ok ? colors.success : colors.error}
                />
                <View style={styles.caseBody}>
                  <Text style={[styles.caseName, { color: colors.text }]}>
                    {report.name}
                  </Text>
                  {report.error !== undefined && (
                    <Text style={[styles.mono, { color: colors.error }]}>
                      {report.error}
                    </Text>
                  )}
                  {report.mismatches.map((mismatch, index) => (
                    <Text
                      key={`${report.name}-${mismatch.output}-${index}`}
                      style={[styles.mono, { color: colors.textSecondary }]}
                    >
                      {`${mismatch.output}: expected ${asText(mismatch.expected)}, got ${asText(mismatch.actual)}`}
                    </Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {script.tests.length === 0 && (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            No saved test cases. Ask the assistant for them — a case is a JSON
            bag per handle, which is faster to describe than to type here.
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    // Native headers inset their own items; the web header does not.
    paddingRight: Platform.OS === 'web' ? 12 : 0,
  },
  saveText: { fontSize: 16, fontWeight: '600' },
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
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: 14,
    marginBottom: 6,
  },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addButtonText: { fontSize: 15, fontWeight: '600' },
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
  code: {
    minHeight: CODE_MIN_HEIGHT,
    textAlignVertical: 'top',
    fontFamily: MONOSPACE,
    fontSize: 13,
    lineHeight: 19,
  },
  description: { minHeight: 68, textAlignVertical: 'top' },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 8 },
  portRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // `minWidth: 0` is what lets a field give way to the buttons beside it: a web
  // text input will not shrink past its default intrinsic width otherwise.
  portName: { flex: 2, minWidth: 0, marginBottom: 0 },
  portType: { flex: 1, minWidth: 0, marginBottom: 0 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  settingLabel: { flex: 1, fontSize: 13 },
  timeoutInput: { width: 90, marginBottom: 0, textAlign: 'right' },
  runInput: { flex: 2, minWidth: 0, marginBottom: 0 },
  issues: { borderRadius: 10, padding: 10, gap: 6, marginBottom: 8 },
  issueRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  issueText: { flex: 1, fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  primaryButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: { fontSize: 15, fontWeight: '600' },
  secondaryButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  card: { borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 12, gap: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '600' },
  mono: { fontFamily: MONOSPACE, fontSize: 12, lineHeight: 17 },
  caseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  caseBody: { flex: 1, gap: 4 },
  caseName: { fontSize: 14, fontWeight: '600' },
  iconButton: { padding: 10 },
});
