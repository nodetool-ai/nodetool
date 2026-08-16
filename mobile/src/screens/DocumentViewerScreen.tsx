/**
 * Fallback viewer for document kinds that have no dedicated screen yet.
 *
 * A kind reaches this screen because the registry points it here (sketch,
 * today). Rather than leave those documents unopenable, this renders a shape
 * summary plus the raw JSON — enough to confirm what the agent wrote.
 */

import { useEffect, useLayoutEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DocumentKind } from '../documents/kinds';

import { RootStackParamList } from '../navigation/types';
import { useTheme } from '../hooks/useTheme';
import { documentStore } from '../documents/documentStore';
import { documentKindInfo } from '../documents/kinds';
import { isRecord, isString } from '../utils/typePredicates';

type DocumentViewerScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'DocumentViewer'>;
  route: RouteProp<RootStackParamList, 'DocumentViewer'>;
};

interface FieldSummary {
  key: string;
  value: string;
}

/** One line per top-level field: length for collections, the value for scalars. */
function summarizeFields(doc: unknown): FieldSummary[] {
  if (!isRecord(doc) || Array.isArray(doc)) {
    return [];
  }
  return Object.entries(doc as Record<string, unknown>).map(([key, value]) => ({
    key,
    value: describeValue(value),
  }));
}

function describeValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? '' : 's'}`;
  }
  if (isRecord(value)) {
    return `${Object.keys(value as Record<string, unknown>).length} field(s)`;
  }
  if (isString(value)) {
    return value.length > 60 ? `${value.slice(0, 60)}…` : value;
  }
  return String(value);
}

export default function DocumentViewerScreen({
  navigation,
  route,
}: DocumentViewerScreenProps) {
  const { kind, id, name: seedName } = route.params;
  const { colors, shadows } = useTheme();
  const insets = useSafeAreaInsets();

  const useStore = useMemo(
    () => documentStore<unknown>(kind as DocumentKind, id),
    [kind, id]
  );
  const doc = useStore((state) => state.doc);
  const name = useStore((state) => state.name);
  const status = useStore((state) => state.status);
  const error = useStore((state) => state.error);
  const updatedAt = useStore((state) => state.updatedAt);
  const load = useStore((state) => state.load);

  useEffect(() => {
    void load();
  }, [load]);

  const headerTitle = name || seedName || 'Document';
  useLayoutEffect(() => {
    navigation.setOptions({ title: headerTitle });
  }, [navigation, headerTitle]);

  const kindLabel = useMemo(() => {
    try {
      return documentKindInfo(kind as DocumentKind).label;
    } catch {
      // An unregistered kind can still be opened by id; name it as-is.
      return kind;
    }
  }, [kind]);

  const fields = useMemo(() => summarizeFields(doc), [doc]);
  const json = useMemo(
    () => (doc === null ? '' : JSON.stringify(doc, null, 2)),
    [doc]
  );

  if (status === 'loading' && doc === null) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.centerText, { color: colors.textSecondary }]}>
          Loading {kindLabel}...
        </Text>
      </View>
    );
  }

  if (doc === null) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <View style={[styles.errorIcon, { backgroundColor: colors.primaryMuted }]}>
          <Ionicons name="alert-circle-outline" size={36} color={colors.error} />
        </View>
        <Text style={[styles.errorTitle, { color: colors.text }]}>
          Could not load {kindLabel}
        </Text>
        {error ? (
          <Text style={[styles.errorText, { color: colors.textSecondary }]}>{error}</Text>
        ) : null}
        <TouchableOpacity
          style={[styles.retryButton, shadows.small, { backgroundColor: colors.primary }]}
          onPress={() => {
            void load();
          }}
          accessibilityRole="button"
          accessibilityLabel="Retry loading document"
          activeOpacity={0.7}
        >
          <Ionicons name="refresh-outline" size={16} color={colors.textOnPrimary} />
          <Text style={[styles.retryText, { color: colors.textOnPrimary }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <View style={styles.headerSection}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
          {headerTitle}
        </Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]}>
          {kindLabel}
          {updatedAt ? ` · updated ${new Date(updatedAt).toLocaleString()}` : ''}
        </Text>
      </View>

      <View
        style={[
          styles.note,
          { backgroundColor: colors.primaryMuted, borderColor: colors.borderLight },
        ]}
      >
        <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
        <Text style={[styles.noteText, { color: colors.textSecondary }]}>
          A {kindLabel} has no dedicated mobile screen yet. This generic view shows the
          document read-only so every kind can still be opened and inspected.
        </Text>
      </View>

      {fields.length > 0 ? (
        <View
          style={[
            styles.card,
            shadows.small,
            { backgroundColor: colors.cardBg, borderColor: colors.borderLight },
          ]}
        >
          {fields.map((field, index) => (
            <View
              key={field.key}
              style={[
                styles.fieldRow,
                index < fields.length - 1 && {
                  borderBottomColor: colors.borderLight,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <Text style={[styles.fieldKey, { color: colors.textSecondary }]}>
                {field.key}
              </Text>
              <Text
                style={[styles.fieldValue, { color: colors.text }]}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {field.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>JSON</Text>
      {/*
        The block is not height-capped: its only scroller is horizontal, so a
        cap would put everything past it out of reach on the one screen whose
        job is inspecting the document. The page scroller carries it instead.
      */}
      <ScrollView
        horizontal
        style={[
          styles.jsonBlock,
          { backgroundColor: colors.inputBg, borderColor: colors.borderLight },
        ]}
        contentContainerStyle={styles.jsonContent}
      >
        <Text style={[styles.jsonText, { color: colors.text }]} selectable>
          {json}
        </Text>
      </ScrollView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  centerText: {
    fontSize: 15,
  },
  errorIcon: {
    width: 72,
    height: 72,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '600',
  },
  headerSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  meta: {
    fontSize: 14,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  fieldRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    alignItems: 'flex-start',
  },
  fieldKey: {
    fontSize: 13,
    width: 110,
    marginRight: 8,
  },
  fieldValue: {
    flex: 1,
    fontSize: 14,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  jsonBlock: {
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  jsonContent: {
    padding: 12,
  },
  jsonText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 17,
  },
});
