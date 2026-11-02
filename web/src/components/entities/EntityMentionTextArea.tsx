/**
 * EntityMentionTextArea — a prompt box where typing `@` picks a library entity.
 *
 * It is `TextArea` with the chat composer's `@` picker (`useTextareaAssetMention`)
 * in entities-only mode. A box that keeps its own entity list passes
 * `onMentionEntity`: the entity's name goes into the text and the host
 * attaches the entity to its list. Without it the entity goes into the text as
 * its `entity://<id>` token, which the server expands when the prompt is sent,
 * and the chips under the box name each mentioned entity. This is how the chat
 * composer attaches one.
 */

import React, { memo, useCallback, useRef } from "react";

import type { Entity } from "@nodetool-ai/protocol";

import { useTextareaAssetMention } from "../chat/composer/useTextareaAssetMention";
import MentionedEntities from "../chat/composer/MentionedEntities";
import { FlexColumn, SPACING, TextArea, type TextAreaProps } from "../ui_primitives";

export interface EntityMentionTextAreaProps extends TextAreaProps {
  /**
   * Attach a picked entity to the host's own list. The entity's name replaces
   * the `@query` in the text. Leave it out to write an `entity://` token.
   */
  onMentionEntity?: (entity: Entity) => void;
}

const EntityMentionTextAreaInner: React.FC<EntityMentionTextAreaProps> = ({
  value,
  onChange,
  onKeyDown,
  onMentionEntity,
  disabled,
  ...props
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { mentionMenu, handleKeyDown: handleMentionKeyDown } =
    useTextareaAssetMention({
      textareaRef,
      value,
      setValue: onChange,
      includeEntities: true,
      onSelectEntity: onMentionEntity
    });

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // The textarea's key events bubble to the field's root, so the cast
      // names the element they came from.
      const consumed = handleMentionKeyDown(
        event as unknown as React.KeyboardEvent<HTMLTextAreaElement>
      );
      if (!consumed) {
        onKeyDown?.(event);
      }
    },
    [handleMentionKeyDown, onKeyDown]
  );

  const field = (
    <TextArea
      {...props}
      value={value}
      onChange={onChange}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      inputRef={textareaRef}
    />
  );

  // A host with its own list shows it; a token needs the chips to be readable.
  if (onMentionEntity) {
    return (
      <>
        {field}
        {mentionMenu}
      </>
    );
  }
  return (
    <FlexColumn gap={SPACING.xs}>
      {field}
      <MentionedEntities value={value} setValue={onChange} />
      {mentionMenu}
    </FlexColumn>
  );
};

export const EntityMentionTextArea = memo(EntityMentionTextAreaInner);
EntityMentionTextArea.displayName = "EntityMentionTextArea";

export default EntityMentionTextArea;
