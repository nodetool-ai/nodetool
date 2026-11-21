/**
 * Whether a key event belongs to an input method composition. Chinese,
 * Japanese and Korean input methods use Enter to confirm the characters a
 * user is choosing, so an Enter handler that submits, renames or searches
 * must ignore it. Safari reports the confirming Enter with `keyCode` 229
 * and `isComposing` false, so both are checked.
 */
export const isImeComposing = (
  event: Pick<KeyboardEvent, "isComposing" | "keyCode"> | {
    nativeEvent: Pick<KeyboardEvent, "isComposing" | "keyCode">;
  }
): boolean => {
  const native = "nativeEvent" in event ? event.nativeEvent : event;
  return native.isComposing || native.keyCode === 229;
};
