/**
 * Give someone access to a document by name, without sending a link. Finds
 * people in the user directory of a self-hosted SSO server; the share dialog
 * shows this only there.
 */
import { memo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  PEOPLE_SEARCH_MIN_LENGTH,
  usePeopleSearch,
  type Person
} from "../../serverState/usePeopleSearch";
import type { CollaboratorRole } from "../../serverState/useWorkflowSharing";
import {
  Autocomplete,
  Box,
  EditorButton,
  FlexRow,
  SelectField,
  SPACING
} from "../ui_primitives";

export const personLabel = (person: {
  user_id: string;
  display_name?: string | null;
  email?: string | null;
}): string => person.display_name ?? person.email ?? person.user_id;

interface InvitePeopleProps {
  inviting: boolean;
  onInvite: (userId: string, role: CollaboratorRole) => Promise<unknown>;
}

const InvitePeople = ({ inviting, onInvite }: InvitePeopleProps) => {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [person, setPerson] = useState<Person | null>(null);
  const [role, setRole] = useState<CollaboratorRole>("viewer");
  const search = usePeopleSearch(person ? "" : input);

  const roleOptions = [
    { value: "viewer", label: t("pass3_37.shareWorkflow.roleViewer") },
    { value: "editor", label: t("pass3_37.shareWorkflow.roleEditor") }
  ];

  const handleInvite = useCallback(async () => {
    if (!person) return;
    try {
      await onInvite(person.user_id, role);
      setPerson(null);
      setInput("");
    } catch {
      // The dialog reports the failure; keep the choice so it can be retried.
    }
  }, [person, role, onInvite]);

  const noOptionsText =
    input.trim().length < PEOPLE_SEARCH_MIN_LENGTH
      ? t("shareDocument.invite.typeMore")
      : t("shareDocument.invite.noMatches");

  return (
    <FlexRow gap={SPACING.sm} align="flex-end" wrap>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Autocomplete<Person>
          label={t("shareDocument.invite.label")}
          placeholder={t("shareDocument.invite.placeholder")}
          size="small"
          options={search.data?.people ?? []}
          loading={search.isFetching}
          value={person}
          inputValue={input}
          onInputChange={(_event, value) => setInput(value)}
          onChange={(_event, value) => setPerson(value)}
          getOptionLabel={personLabel}
          getOptionKey={(option) => option.user_id}
          isOptionEqualToValue={(option, value) => option.user_id === value.user_id}
          // The server already matched the text against name and email.
          filterOptions={(options) => options}
          noOptionsText={noOptionsText}
        />
      </Box>
      <SelectField
        label={t("shareDocument.invite.role")}
        hideLabel
        size="small"
        value={role}
        options={roleOptions}
        onChange={(value) => setRole(value === "editor" ? "editor" : "viewer")}
      />
      <EditorButton
        variant="outlined"
        disabled={!person || inviting}
        onClick={() => void handleInvite()}
      >
        {t("shareDocument.invite.submit")}
      </EditorButton>
    </FlexRow>
  );
};

export default memo(InvitePeople);
