/**
 * Fullscreen galleries for the guided flows.
 *
 * Every still or clip a setup view shows carries an expand control. Opening it
 * shows that item fullscreen in {@link AssetViewer}, and the arrows, filmstrip
 * and left/right keys then page through every other item the same view shows:
 * the style samples beside the format art, the references a prompt brought,
 * the whole contact sheet.
 *
 * A view wraps its body in {@link MediaGalleryProvider}. Each media item
 * registers with the nearest provider through {@link GalleryExpandButton} or
 * {@link GalleryFrame}, so a grid needs no list of its neighbours' media. The
 * gallery takes its order from the page at the moment it opens, which is the
 * order the reader sees, and shows an item once however many tiles show it.
 *
 * The media is a mix of library assets (`asset://` locators, whose records
 * carry the content type, thumbnail and download name) and shipped samples
 * that have only a URL. The viewer pages through asset records, so a sample
 * gets a stand-in record built from its resolved URL. Those stand-ins are not
 * in the library, so the viewer hides the edit and info actions for them.
 */

import React, {
  Suspense,
  createContext,
  lazy,
  memo,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import { alpha } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";

import { ContextMenuProvider } from "../../providers/ContextMenuProvider";
import { useAssetsForLocators } from "../../hooks/assets/useAssetsForLocators";
import { useResolvedMediaUris } from "../../hooks/useResolvedMediaUri";
import type { MediaLocator } from "../../hooks/useResolvedMediaUri";
import type { Asset } from "../../stores/ApiTypes";
import { assetIdOf } from "../../utils/mediaRef";
import { isString } from "../../utils/typePredicates";
import {
  BORDER_RADIUS,
  Box,
  MOTION,
  SPACING,
  ToolbarIconButton,
  Z_INDEX,
  reducedMotion
} from "../ui_primitives";

export type GalleryMediaKind = "image" | "video";

export interface GalleryMediaItem {
  locator: MediaLocator;
  kind: GalleryMediaKind;
  /** Laid over the media in the gallery, e.g. the preset or reference name. */
  caption?: string;
}

// The viewer is the asset explorer's, with its editors and renderers. Every
// guided flow step mounts a gallery provider, so it loads on first open only.
const AssetViewer = lazy(() => import("../assets/AssetViewer"));

interface Registration extends GalleryMediaItem {
  element: HTMLElement | null;
}

interface MediaGalleryContextValue {
  register: (id: string, read: () => Registration) => () => void;
  /** Opens the gallery on the item with this locator. */
  open: (locator: MediaLocator) => void;
}

const MediaGalleryContext = createContext<MediaGalleryContextValue | null>(
  null
);

/**
 * What makes two tiles the same media. A ref and the bare `asset://` URI of
 * the same asset are one item.
 */
const locatorKey = (locator: MediaLocator): string | undefined => {
  const assetId = assetIdOf(locator);
  if (assetId) {
    return `asset:${assetId}`;
  }
  const uri = isString(locator) ? locator : locator?.uri;
  return uri ? `uri:${uri}` : undefined;
};

/** Document order, so the gallery pages in the order the view reads. */
const byDocumentOrder = (a: Registration, b: Registration): number => {
  if (!a.element || !b.element || a.element === b.element) {
    return 0;
  }
  return a.element.compareDocumentPosition(b.element) &
    Node.DOCUMENT_POSITION_FOLLOWING
    ? -1
    : 1;
};

/** The class a {@link GalleryExpandButton} host carries to reveal it on hover. */
export const MEDIA_GALLERY_HOST_CLASS = "media-gallery-host";

interface OpenGallery {
  items: GalleryMediaItem[];
  startIndex: number;
}

/**
 * Collects the media of one view and owns its gallery. Mount one per view:
 * the gallery shows everything registered under it.
 */
export const MediaGalleryProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const registry = useRef(new Map<string, () => Registration>());
  const [opened, setOpened] = useState<OpenGallery | null>(null);

  const register = useCallback((id: string, read: () => Registration) => {
    registry.current.set(id, read);
    return () => {
      registry.current.delete(id);
    };
  }, []);

  const open = useCallback((locator: MediaLocator) => {
    const target = locatorKey(locator);
    if (!target) {
      return;
    }
    const seen = new Set<string>();
    const items: GalleryMediaItem[] = [];
    [...registry.current.values()]
      .map((read) => read())
      .sort(byDocumentOrder)
      .forEach(({ locator: itemLocator, kind, caption }) => {
        const key = locatorKey(itemLocator);
        if (!key || seen.has(key)) {
          return;
        }
        seen.add(key);
        items.push({ locator: itemLocator, kind, caption });
      });
    const startIndex = items.findIndex(
      (item) => locatorKey(item.locator) === target
    );
    setOpened(
      startIndex === -1
        ? { items: [{ locator, kind: "image" }], startIndex: 0 }
        : { items, startIndex }
    );
  }, []);

  const handleClose = useCallback(() => setOpened(null), []);
  const value = useMemo(() => ({ register, open }), [register, open]);

  return (
    <MediaGalleryContext.Provider value={value}>
      {children}
      {opened ? (
        <MediaGallery
          items={opened.items}
          startIndex={opened.startIndex}
          onClose={handleClose}
        />
      ) : null}
    </MediaGalleryContext.Provider>
  );
};

/**
 * Opens the surrounding view's gallery, for a control that already exists —
 * a thumbnail button. Null outside a {@link MediaGalleryProvider}.
 */
export const useMediaGallery = (): MediaGalleryContextValue["open"] | null =>
  useContext(MediaGalleryContext)?.open ?? null;

/**
 * Adds one item to the surrounding view's gallery. `element` places it in the
 * gallery's order.
 */
export const useGalleryMedia = (
  item: GalleryMediaItem,
  element: React.RefObject<HTMLElement | null>
): void => {
  const gallery = useContext(MediaGalleryContext);
  const id = useId();
  const latest = useRef(item);
  useEffect(() => {
    latest.current = item;
  });
  useEffect(() => {
    if (!gallery) {
      return undefined;
    }
    return gallery.register(id, () => ({
      ...latest.current,
      element: element.current
    }));
  }, [gallery, id, element]);
};

const DETACHED_ID_PREFIX = "media-gallery-";

/** A stand-in record for media that has a URL but no library row. */
const detachedAsset = (
  id: string,
  url: string,
  item: GalleryMediaItem
): Asset => {
  const lastSegment = url.split(/[?#]/)[0].split("/").pop() ?? "";
  return {
    id,
    user_id: "",
    parent_id: null,
    name: lastSegment.includes(".") ? lastSegment : (item.caption ?? ""),
    content_type: item.kind === "video" ? "video/mp4" : "image/png",
    workflow_id: null,
    created_at: "",
    get_url: url,
    thumb_url: item.kind === "image" ? url : null
  };
};

interface MediaGalleryProps {
  items: GalleryMediaItem[];
  startIndex: number;
  onClose: () => void;
}

const MediaGalleryInner: React.FC<MediaGalleryProps> = ({
  items,
  startIndex,
  onClose
}) => {
  const locators = useMemo(() => items.map((item) => item.locator), [items]);
  const records = useAssetsForLocators(locators);
  const urls = useResolvedMediaUris(locators);

  // Positionally aligned with `items`. An item still resolving is undefined
  // and drops out of the strip rather than shifting it.
  const resolved = items.map((item, index): Asset | undefined => {
    const record = records[index];
    if (record) {
      return record;
    }
    const url = urls[index];
    if (!url || assetIdOf(item.locator)) {
      return undefined;
    }
    return detachedAsset(`${DETACHED_ID_PREFIX}${index}`, url, item);
  });
  // The query results are new arrays on every refetch, and the viewer returns
  // to its opening item whenever its list changes identity. Only a change in
  // what resolved may rebuild the list.
  const signature = resolved
    .map((asset) => (asset ? `${asset.id} ${asset.get_url}` : ""))
    .join("\n");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const aligned = useMemo(() => resolved, [signature]);

  const galleryAssets = useMemo(
    () => aligned.filter((asset): asset is Asset => asset !== undefined),
    [aligned]
  );
  const captions = useMemo(() => {
    const byId: Record<string, string> = {};
    aligned.forEach((asset, index) => {
      const caption = items[index].caption;
      if (asset && caption) {
        byId[asset.id] = caption;
      }
    });
    return byId;
  }, [aligned, items]);
  const detachedIds = useMemo(
    () =>
      new Set(
        galleryAssets
          .filter((asset) => asset.id.startsWith(DETACHED_ID_PREFIX))
          .map((asset) => asset.id)
      ),
    [galleryAssets]
  );

  const startAsset = aligned[startIndex];
  if (!startAsset) {
    return null;
  }

  return (
    // Guided flows mount no asset context menus, so opening one is a no-op.
    <ContextMenuProvider active={false}>
      <Suspense fallback={null}>
        <AssetViewer
          asset={startAsset}
          sortedAssets={galleryAssets}
          captions={captions}
          detachedIds={detachedIds}
          open
          onClose={onClose}
        />
      </Suspense>
    </ContextMenuProvider>
  );
};

const MediaGallery = memo(MediaGalleryInner);

const expandButtonSx: SxProps<Theme> = (theme) => ({
  position: "absolute",
  top: theme.spacing(SPACING.xs),
  right: theme.spacing(SPACING.xs),
  zIndex: Z_INDEX.raised,
  borderRadius: BORDER_RADIUS.circle,
  color: theme.vars.palette.common.white,
  backgroundColor: alpha(theme.palette.common.black, 0.55),
  opacity: 0,
  transition: MOTION.opacity,
  ...reducedMotion({ transition: "none" }),
  "&:hover": {
    backgroundColor: alpha(theme.palette.common.black, 0.75)
  },
  [`.${MEDIA_GALLERY_HOST_CLASS}:hover &, .${MEDIA_GALLERY_HOST_CLASS}:focus-within &, &:focus-visible`]:
    { opacity: 1 },
  // A touch screen has no hover to reveal it.
  "@media (hover: none)": { opacity: 1 },
  // A host that stretches its children (a preset's preview area) must not
  // stretch the control.
  "&&": { width: "auto" }
});

export interface GalleryExpandButtonProps extends GalleryMediaItem {
  /** Names the media for the button, e.g. "Noir sample". */
  label?: string;
}

/**
 * The expand control in a media tile's corner. Its host must be positioned
 * and carry {@link MEDIA_GALLERY_HOST_CLASS}. Renders nothing outside a
 * {@link MediaGalleryProvider}.
 */
export const GalleryExpandButton: React.FC<GalleryExpandButtonProps> = ({
  locator,
  kind,
  caption,
  label
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  const open = useMediaGallery();
  useGalleryMedia({ locator, kind, caption }, ref);

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      // The tile around the media may itself be a control.
      event.stopPropagation();
      open?.(locator);
    },
    [open, locator]
  );

  if (!open || !locator) {
    return null;
  }
  const name = label ?? caption;
  return (
    <ToolbarIconButton
      ref={ref}
      icon={<FullscreenIcon fontSize="small" />}
      tooltip="View fullscreen"
      ariaLabel={name ? `View ${name} fullscreen` : "View fullscreen"}
      onClick={handleClick}
      data-testid="media-gallery-expand"
      sx={expandButtonSx}
    />
  );
};

export interface GalleryFrameProps extends GalleryExpandButtonProps {
  children: React.ReactNode;
  sx?: SxProps<Theme>;
}

/** Media with an expand control in its corner, for media that has no host. */
export const GalleryFrame: React.FC<GalleryFrameProps> = ({
  children,
  sx,
  ...item
}) => (
  <Box
    className={MEDIA_GALLERY_HOST_CLASS}
    sx={[
      { position: "relative", width: "fit-content", maxWidth: "100%" },
      ...(Array.isArray(sx) ? sx : [sx])
    ]}
  >
    {children}
    <GalleryExpandButton {...item} />
  </Box>
);

/**
 * Adds media to the view's gallery without a control of its own, for a
 * thumbnail that is already a button and opens the gallery through
 * {@link useMediaGallery}.
 */
export const GallerySource: React.FC<GalleryMediaItem> = ({
  locator,
  kind,
  caption
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  useGalleryMedia({ locator, kind, caption }, ref);
  return <Box component="span" ref={ref} hidden />;
};
