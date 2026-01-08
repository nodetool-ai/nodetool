import { useCallback, useEffect } from "react";

type RefType =
  | React.RefObject<HTMLElement>
  | ((node: HTMLElement | null) => void)
  | null;

function unwrapRef(ref: RefType): HTMLElement | null {
  if (ref === null) {
    return null;
  }
  if (typeof ref === "function") {
    return null;
  }
  return ref.current ?? null;
}

export interface UseClickOutsideOptions {
  ref?: React.RefObject<HTMLElement> | ((node: HTMLElement | null) => void) | null;
  onClickOutside: (event: MouseEvent | TouchEvent) => void;
  enabled?: boolean;
}

function isUseClickOutsideOptions(obj: unknown): obj is UseClickOutsideOptions {
  if (!obj || typeof obj !== "object") {
    return false;
  }
  return "onClickOutside" in obj;
}

export function useClickOutside(
  ref: React.RefObject<HTMLElement> | ((node: HTMLElement | null) => void) | null,
  options?: UseClickOutsideOptions
): void;
export function useClickOutside(
  options: UseClickOutsideOptions
): void;
export function useClickOutside(
  refOrOptions:
    | React.RefObject<HTMLElement>
    | ((node: HTMLElement | null) => void)
    | null
    | UseClickOutsideOptions,
  options?: UseClickOutsideOptions
): void {
  let ref: React.RefObject<HTMLElement> | ((node: HTMLElement | null) => void) | null;
  let onClickOutside: ((event: MouseEvent | TouchEvent) => void) | undefined;
  let enabled = true;

  if (isUseClickOutsideOptions(refOrOptions)) {
    ref = refOrOptions.ref ?? null;
    onClickOutside = refOrOptions.onClickOutside;
    enabled = refOrOptions.enabled ?? true;
  } else {
    ref = refOrOptions;
    if (options) {
      onClickOutside = options.onClickOutside;
      enabled = options.enabled ?? true;
    }
  }

  const handleClickOutside = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (!enabled) {
        return;
      }
      if (!onClickOutside) {
        return;
      }

      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      const element = unwrapRef(ref);
      if (element && !element.contains(target)) {
        onClickOutside(event);
      }
    },
    [onClickOutside, ref, enabled]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (!onClickOutside) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      handleClickOutside(event);
    };

    const handleTouchStart = (event: TouchEvent) => {
      handleClickOutside(event);
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("touchstart", handleTouchStart);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("touchstart", handleTouchStart);
    };
  }, [handleClickOutside, enabled, onClickOutside]);
}

export interface UseClickOutsideMultipleOptions {
  refs: (
    | React.RefObject<HTMLElement>
    | ((node: HTMLElement | null) => void)
    | null
  )[];
  onClickOutside: (event: MouseEvent | TouchEvent) => void;
  enabled?: boolean;
}

export function useClickOutsideMultiple(
  refs: (
    | React.RefObject<HTMLElement>
    | ((node: HTMLElement | null) => void)
    | null
  )[],
  options?: UseClickOutsideMultipleOptions
): void;
export function useClickOutsideMultiple(
  options: UseClickOutsideMultipleOptions
): void;
export function useClickOutsideMultiple(
  refsOrOptions:
    | (
        | React.RefObject<HTMLElement>
        | ((node: HTMLElement | null) => void)
        | null
      )[]
    | UseClickOutsideMultipleOptions,
  options?: UseClickOutsideMultipleOptions
): void {
  let refs: (
    | React.RefObject<HTMLElement>
    | ((node: HTMLElement | null) => void)
    | null
  )[];
  let onClickOutside: ((event: MouseEvent | TouchEvent) => void) | undefined;
  let enabled = true;

  if (Array.isArray(refsOrOptions)) {
    refs = refsOrOptions;
    if (options) {
      onClickOutside = options.onClickOutside;
      enabled = options.enabled ?? true;
    }
  } else {
    refs = refsOrOptions.refs;
    onClickOutside = refsOrOptions.onClickOutside;
    enabled = refsOrOptions.enabled ?? true;
  }

  const handleClickOutside = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (!enabled) {
        return;
      }
      if (!onClickOutside) {
        return;
      }

      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      const elements = refs.map((r) => unwrapRef(r as RefType)).filter(Boolean);
      const clickedInsideAny = elements.some((element) => element?.contains(target));

      if (!clickedInsideAny) {
        onClickOutside(event);
      }
    },
    [onClickOutside, refs, enabled]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (!onClickOutside) {
      return;
    }

    const handleMouseDown = (event: MouseEvent) => {
      handleClickOutside(event);
    };

    const handleTouchStart = (event: TouchEvent) => {
      handleClickOutside(event);
    };

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("touchstart", handleTouchStart);

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("touchstart", handleTouchStart);
    };
  }, [handleClickOutside, enabled, onClickOutside]);
}
