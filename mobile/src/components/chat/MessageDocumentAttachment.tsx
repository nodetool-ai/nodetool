/**
 * The card a chat message shows for an attached file that is not media (a
 * PDF, a Word or spreadsheet file): a type icon on a tinted tile, the file
 * name, and a "PDF · 1.4 MB" detail line.
 * Mirrors web/src/components/chat/message/MessageDocumentAttachment.tsx.
 *
 * Tapping opens the file when it has a web URL. An inline `data:` payload or
 * a device-local path has no URL another app can open, so the card stays
 * informational.
 */

import React, { useMemo } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  chatAttachmentDetail,
  describeChatAttachment,
  type MessageDocumentContent,
} from '@nodetool-ai/protocol';
import { useTheme } from '../../hooks/useTheme';
import { useResolvedMediaUri } from '../../hooks/useResolvedMediaUri';
import type { ThemeColors } from '../../utils/theme';
import { FONT_SIZE, FONT_WEIGHT, MIN_TOUCH_TARGET, RADIUS, SPACING } from '../../utils/tokens';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Tone = 'error' | 'info' | 'success' | 'warning' | 'neutral';

const TYPE_VISUALS: Record<string, { icon: IconName; tone: Tone }> = {
  PDF: { icon: 'document-text-outline', tone: 'error' },
  DOC: { icon: 'document-text-outline', tone: 'info' },
  DOCX: { icon: 'document-text-outline', tone: 'info' },
  PAGES: { icon: 'document-text-outline', tone: 'info' },
  RTF: { icon: 'document-text-outline', tone: 'info' },
  TXT: { icon: 'document-text-outline', tone: 'neutral' },
  MD: { icon: 'document-text-outline', tone: 'neutral' },
  XLS: { icon: 'grid-outline', tone: 'success' },
  XLSX: { icon: 'grid-outline', tone: 'success' },
  CSV: { icon: 'grid-outline', tone: 'success' },
  NUMBERS: { icon: 'grid-outline', tone: 'success' },
  PPT: { icon: 'easel-outline', tone: 'warning' },
  PPTX: { icon: 'easel-outline', tone: 'warning' },
  KEY: { icon: 'easel-outline', tone: 'warning' },
};

const FALLBACK_VISUAL: { icon: IconName; tone: Tone } = {
  icon: 'document-outline',
  tone: 'neutral',
};

const toneColor = (colors: ThemeColors, tone: Tone): string =>
  tone === 'neutral' ? colors.textSecondary : colors[tone];

/** A 12% wash of a `#rrggbb` color, or the neutral surface for anything else. */
const toneWash = (colors: ThemeColors, tone: Tone): string => {
  const color = toneColor(colors, tone);
  return tone !== 'neutral' && /^#[0-9a-f]{6}$/i.test(color)
    ? `${color}1F`
    : colors.surfaceElevated;
};

interface MessageDocumentAttachmentProps {
  document: MessageDocumentContent['document'];
}

export const MessageDocumentAttachment: React.FC<MessageDocumentAttachmentProps> = ({
  document,
}) => {
  const { colors } = useTheme();
  const url = useResolvedMediaUri(document);
  const info = useMemo(() => describeChatAttachment(document), [document]);
  const name = info.name || 'Document';
  const detail = chatAttachmentDetail(info);
  const { icon, tone } = TYPE_VISUALS[info.typeLabel] ?? FALLBACK_VISUAL;
  const openUrl = url && /^https?:\/\//i.test(url) ? url : null;

  return (
    <TouchableOpacity
      testID="message-document-attachment"
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
      onPress={openUrl ? () => void Linking.openURL(openUrl) : undefined}
      disabled={!openUrl}
      activeOpacity={0.7}
      accessibilityRole={openUrl ? 'button' : undefined}
      accessibilityLabel={detail ? `${name}, ${detail}` : name}
      accessibilityHint={openUrl ? 'Opens the file' : undefined}
    >
      <View style={[styles.iconTile, { backgroundColor: toneWash(colors, tone) }]}>
        <Ionicons name={icon} size={20} color={toneColor(colors, tone)} />
      </View>
      <View style={styles.textColumn}>
        <Text
          style={[styles.name, { color: colors.text }]}
          numberOfLines={1}
          ellipsizeMode="middle"
        >
          {name}
        </Text>
        {detail ? (
          <Text style={[styles.detail, { color: colors.textSecondary }]} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const ICON_TILE_SIZE = 36;
const CARD_MAX_WIDTH = 320;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    maxWidth: CARD_MAX_WIDTH,
    minHeight: MIN_TOUCH_TARGET,
    marginVertical: SPACING.xs,
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconTile: {
    width: ICON_TILE_SIZE,
    height: ICON_TILE_SIZE,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textColumn: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: FONT_SIZE.footnote,
    fontWeight: FONT_WEIGHT.medium,
  },
  detail: {
    fontSize: FONT_SIZE.caption,
    marginTop: SPACING.xxs,
  },
});
