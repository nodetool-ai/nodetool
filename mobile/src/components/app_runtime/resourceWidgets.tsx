/**
 * Native surface for the catalog's resource widgets.
 *
 * A resource widget names a `ResourceBinding` in the app document — a kind plus
 * either a collection or one pinned id. Mobile already has a screen per
 * document kind, so a bound resource renders as a card that says what the
 * document is and opens it on tap. Which screen that is comes from
 * `documents/kinds.ts`; this file never decides.
 *
 * `ResourcePicker` and `ResourceGallery` collapse into the same list of rows:
 * at phone width a grid of tiles buys nothing over rows, and both widgets make
 * the same selection — the `ResourceRef` an operation input mapped
 * `from: "resource"` passes to the run.
 *
 * A binding that resolves to nothing — no declaration, a deleted document, an
 * empty collection — says so. Nothing here renders a card that would navigate
 * into a document that is not there.
 */
import React, { useCallback, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import type {
  AppEvent,
  ResourceRef,
} from "@nodetool-ai/app-runtime";

import { useTheme } from "../../hooks/useTheme";
import type { ThemeColors } from "../../utils/theme";
import { documentBackend } from "../../documents/backends";
import { documentKindInfo, type ResourceDocumentKind } from "../../documents/kinds";
import { useAppRuntimeContext } from "./AppRuntimeContext";
import { useOpenResource } from "./useOpenResource";
import { useWidgetRuntime } from "./useWidgetRuntime";
import { isRecord, isString } from "../../utils/typePredicates";

/** How many members of a collection one widget lists. */
const LIST_LIMIT = 25;

type IconName = keyof typeof Ionicons.glyphMap;

interface ResourceWidgetProps {
  id: string;
  events?: AppEvent[];
  disabled?: boolean;
  props: Record<string, unknown>;
}

const str = (value: unknown): string => (isString(value) ? value : "");

const arrayLength = (doc: unknown, key: string): number => {
  const value = isRecord(doc) ? doc[key] : undefined;
  return Array.isArray(value) ? value.length : 0;
};

const plural = (count: number, noun: string): string =>
  `${count} ${count === 1 ? noun : `${noun}s`}`;

/**
 * What a card says about a document below its name. Read off the loaded body,
 * so it is the document's own shape talking rather than a generic stamp.
 */
const documentSummary = (kind: ResourceDocumentKind, doc: unknown): string => {
  switch (kind) {
    case "storyboard":
      return plural(arrayLength(doc, "shots"), "shot");
    case "timeline":
      return `${plural(arrayLength(doc, "clips"), "clip")} · ${plural(
        arrayLength(doc, "tracks"),
        "track"
      )}`;
    default:
      return "";
  }
};

const shortDate = (iso: string | null | undefined): string => {
  if (!iso) {
    return "";
  }
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? "" : new Date(time).toLocaleDateString();
};

// ── Pieces ──────────────────────────────────────────────────────────────────

const ResourceNote: React.FC<{ text: string; colors: ThemeColors }> = ({
  text,
  colors,
}) => (
  <View style={[styles.note, { borderColor: colors.border }]}>
    <Text style={[styles.noteText, { color: colors.textTertiary }]}>{text}</Text>
  </View>
);

interface ResourceCardProps {
  kind: ResourceDocumentKind;
  name: string;
  summary: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

const ResourceCard: React.FC<ResourceCardProps> = ({
  kind,
  name,
  summary,
  selected,
  disabled,
  onPress,
}) => {
  const { colors } = useTheme();
  const info = documentKindInfo(kind);
  const meta = summary ? `${info.label} · ${summary}` : info.label;

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}, ${info.label}`}
      accessibilityState={{ disabled: Boolean(disabled), selected }}
      disabled={disabled}
      activeOpacity={0.7}
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: colors.cardBg,
          borderColor: selected ? colors.primary : colors.borderLight,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <View style={[styles.cardIcon, { backgroundColor: colors.primaryMuted }]}>
        <Ionicons
          name={info.icon as IconName}
          size={20}
          color={colors.primary}
        />
      </View>
      <View style={styles.cardText}>
        <Text numberOfLines={1} style={[styles.cardName, { color: colors.text }]}>
          {name}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.cardMeta, { color: colors.textSecondary }]}
        >
          {meta}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={colors.textTertiary}
      />
    </TouchableOpacity>
  );
};

// ── Data ────────────────────────────────────────────────────────────────────

interface CollectionEntry {
  id: string;
  name: string;
  updatedAt: string;
}

/**
 * The declared binding a widget names. `asset` is separated out because it is
 * not a document: it has no `DocumentBackend` and no document screen, so no
 * card can be built for a collection of them.
 */
const useResourceBinding = (
  resourceBindingId: string | undefined
) => {
  const { resources } = useAppRuntimeContext();
  const binding = resources.find((entry) => entry.id === resourceBindingId);
  const kind = binding && binding.kind !== "asset" ? binding.kind : null;
  return { binding, kind };
};

/** Members of a bound collection. Disabled while a binding pins one id. */
const useCollection = (kind: ResourceDocumentKind | null, enabled: boolean) => {
  const query = useQuery({
    queryKey: ["app-runtime", "resource-list", kind, LIST_LIMIT],
    queryFn: async (): Promise<CollectionEntry[]> => {
      if (!kind) {
        throw new Error("No resource kind to list");
      }
      const summaries = await documentBackend(kind).list(LIST_LIMIT);
      return summaries.map((summary) => ({
        id: summary.id,
        name: summary.name || `Untitled ${kind}`,
        updatedAt: summary.updatedAt,
      }));
    },
    enabled: enabled && kind !== null,
  });
  return {
    entries: useMemo(() => query.data ?? [], [query.data]),
    isLoading: query.isLoading && query.fetchStatus !== "idle",
    failed: query.isError,
  };
};

/**
 * One document, read for its name and its body. A read that fails is how a
 * deleted or inaccessible document is detected — the listing cannot say,
 * because a pinned id may sit outside the page it returns.
 */
const useResourceDetail = (
  kind: ResourceDocumentKind | null,
  id: string | undefined
) => {
  const query = useQuery({
    queryKey: ["app-runtime", "resource-detail", kind, id],
    queryFn: async () => {
      if (!kind || !id) {
        throw new Error("No resource to read");
      }
      const loaded = await documentBackend(kind).read(id);
      return { name: loaded.name, doc: loaded.doc };
    },
    enabled: Boolean(kind && id),
    retry: false,
  });
  return {
    detail: query.data ?? null,
    isLoading: query.isLoading && query.fetchStatus !== "idle",
    failed: query.isError,
  };
};

// ── Widgets ─────────────────────────────────────────────────────────────────

/**
 * A picker and a gallery over a bound collection. Tapping a row both selects it
 * — so an operation input mapped `from: "resource"` sees the ref — and opens
 * the document, because on a phone "open" is the gesture a row invites.
 */
const ResourceListWidget: React.FC<ResourceWidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { selectResource } = useAppRuntimeContext();
  const openResource = useOpenResource();
  const { emit } = useWidgetRuntime({ ...widget, bindingMode: "none" });

  const bindingId = str(widget.props.resourceBindingId);
  const { binding, kind } = useResourceBinding(bindingId);
  const pinnedId = binding?.scope.fixedId;

  const collection = useCollection(kind, Boolean(binding) && !pinnedId);
  const pinned = useResourceDetail(kind, pinnedId);

  // Report the pinned pick once; an unpinned collection reports on tap.
  useEffect(() => {
    if (!binding || !kind || !pinnedId) {
      return;
    }
    selectResource(
      binding.id,
      pinned.failed ? null : { kind, id: pinnedId }
    );
  }, [binding, kind, pinned.failed, pinnedId, selectResource]);

  const choose = useCallback(
    (entry: CollectionEntry) => {
      if (!binding || !kind) {
        return;
      }
      const ref: ResourceRef = { kind, id: entry.id };
      selectResource(binding.id, ref);
      emit("change");
      openResource(ref, entry.name);
    },
    [binding, emit, kind, openResource, selectResource]
  );

  const label = str(widget.props.label) || binding?.name || "Resource";

  if (!binding) {
    return (
      <ResourceNote
        text="This widget is not bound to a resource."
        colors={colors}
      />
    );
  }

  if (!kind) {
    return (
      <ResourceNote
        text="Asset collections are browsed in the Assets library."
        colors={colors}
      />
    );
  }

  const info = documentKindInfo(kind);

  if (pinnedId) {
    if (pinned.isLoading) {
      return <ActivityIndicator color={colors.primary} />;
    }
    if (pinned.failed || !pinned.detail) {
      return (
        <ResourceNote
          text={`This ${info.label.toLowerCase()} is no longer available.`}
          colors={colors}
        />
      );
    }
    return (
      <View style={styles.stack}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        <ResourceCard
          kind={kind}
          name={pinned.detail.name}
          summary={documentSummary(kind, pinned.detail.doc)}
          disabled={widget.disabled}
          onPress={() => {
            const ref: ResourceRef = { kind, id: pinnedId };
            selectResource(binding.id, ref);
            openResource(ref, pinned.detail?.name);
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      {collection.isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : collection.failed ? (
        <ResourceNote
          text={`Could not load ${info.plural.toLowerCase()}.`}
          colors={colors}
        />
      ) : collection.entries.length === 0 ? (
        <ResourceNote
          text={`No ${info.plural.toLowerCase()} in this collection yet.`}
          colors={colors}
        />
      ) : (
        collection.entries.map((entry) => (
          <ResourceCard
            key={entry.id}
            kind={kind}
            name={entry.name}
            summary={shortDate(entry.updatedAt)}
            disabled={widget.disabled}
            onPress={() => choose(entry)}
          />
        ))
      )}
    </View>
  );
};

/**
 * The scene list edits its bound storyboard rather than app state. Mobile has a
 * storyboard editor that does exactly that, so the widget is a card into it,
 * summarised by the shot count the editor will show.
 */
const StoryboardSceneListWidget: React.FC<ResourceWidgetProps> = (widget) => {
  const { colors } = useTheme();
  const { selectResource } = useAppRuntimeContext();
  const openResource = useOpenResource();

  const bindingId = str(widget.props.resourceBindingId);
  const { binding, kind } = useResourceBinding(bindingId);
  const pinnedId = binding?.scope.fixedId;

  // Unpinned, the widget edits the first storyboard in the collection — the
  // same fallback the web widget makes, so it has something to show.
  const collection = useCollection(kind, Boolean(binding) && !pinnedId);
  const targetId = pinnedId ?? collection.entries[0]?.id;
  const target = useResourceDetail(kind, targetId);

  useEffect(() => {
    if (!binding || !kind) {
      return;
    }
    selectResource(
      binding.id,
      targetId && !target.failed ? { kind, id: targetId } : null
    );
  }, [binding, kind, selectResource, target.failed, targetId]);

  if (!binding || !kind) {
    return (
      <ResourceNote
        text="This scene list is not bound to a storyboard."
        colors={colors}
      />
    );
  }

  if (collection.isLoading || target.isLoading) {
    return <ActivityIndicator color={colors.primary} />;
  }

  if (!targetId || target.failed || !target.detail) {
    return (
      <ResourceNote
        text="This scene list has no storyboard to show."
        colors={colors}
      />
    );
  }

  const name = target.detail.name;
  return (
    <ResourceCard
      kind={kind}
      name={name}
      summary={documentSummary(kind, target.detail.doc)}
      disabled={widget.disabled}
      onPress={() => openResource({ kind, id: targetId }, name)}
    />
  );
};

export const RESOURCE_RENDERERS = {
  ResourcePicker: ResourceListWidget,
  ResourceGallery: ResourceListWidget,
  StoryboardSceneList: StoryboardSceneListWidget,
} satisfies Record<
  string,
  React.FC<ResourceWidgetProps>
>;

const styles = StyleSheet.create({
  stack: {
    gap: 12,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardName: {
    fontSize: 15,
    fontWeight: "600",
  },
  cardMeta: {
    fontSize: 12,
  },
  note: {
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
  },
  noteText: {
    fontSize: 13,
  },
});
