/**
 * OnePasswordPicker — pick a 1Password field for a provider key, so the
 * key dialog stores an `op://` reference instead of the key itself.
 *
 * First use connects the desktop app account (one approval in the 1Password
 * app). After that the dialog lists vaults, items and fields. The server
 * sends titles and references only, never a field's value.
 */
import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertBanner,
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ScrollArea,
  SearchInput,
  SelectField,
  SelectableListItem,
  SPACING,
  Text,
  TextInput
} from "../ui_primitives";
import {
  useOnePasswordConnection,
  useOnePasswordFields,
  useOnePasswordItems,
  useOnePasswordStatus,
  useOnePasswordVaults
} from "../../serverState/useOnePassword";

export interface OnePasswordPick {
  reference: string;
  /** "Vault › Item › Field", for showing what was picked. */
  label: string;
}

interface OnePasswordPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (pick: OnePasswordPick) => void;
}

const LIST_MAX_HEIGHT = 240;

/** Concealed fields hold keys, so they come first. */
const fieldRank = (fieldType: string): number =>
  fieldType === "Concealed" ? 0 : 1;

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const ConnectStep = memo(function ConnectStep() {
  const { t } = useTranslation();
  const { connect, isConnecting } = useOnePasswordConnection();
  const [account, setAccount] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    const trimmed = account.trim();
    if (!trimmed) return;
    setFailure(null);
    try {
      const result = await connect(trimmed);
      if (!result.ok) setFailure(result.message);
    } catch (err) {
      setFailure(errorText(err));
    }
  }, [account, connect]);

  return (
    <FlexColumn gap={SPACING.lg}>
      <Text>{t("onePassword.connectIntro")}</Text>
      <TextInput
        label={t("onePassword.accountLabel")}
        value={account}
        onChange={(e) => {
          setAccount(e.target.value);
          setFailure(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void handleConnect();
        }}
        placeholder={t("onePassword.accountPlaceholder")}
        helperText={t("onePassword.approveHint")}
        autoFocus
        fullWidth
        size="small"
        variant="outlined"
      />
      {failure && (
        <AlertBanner severity="error" compact>
          {t("onePassword.connectFailed", { message: failure })}
        </AlertBanner>
      )}
      <FlexRow justify="flex-end">
        <EditorButton
          variant="contained"
          onClick={() => void handleConnect()}
          disabled={!account.trim() || isConnecting}
        >
          {isConnecting ? t("onePassword.connecting") : t("onePassword.connect")}
        </EditorButton>
      </FlexRow>
    </FlexColumn>
  );
});

const BrowseStep = memo(function BrowseStep({
  onPick,
  account,
  canSwitchAccount
}: {
  onPick: (pick: OnePasswordPick) => void;
  account: string;
  canSwitchAccount: boolean;
}) {
  const { t } = useTranslation();
  const { disconnect, isDisconnecting } = useOnePasswordConnection();
  const vaults = useOnePasswordVaults(true);
  const [chosenVault, setChosenVault] = useState<string | null>(null);
  const vaultId = chosenVault ?? vaults.data?.[0]?.id ?? null;
  const items = useOnePasswordItems(vaultId);
  const [itemId, setItemId] = useState<string | null>(null);
  const fields = useOnePasswordFields(vaultId, itemId);
  const [search, setSearch] = useState("");

  const vaultOptions = useMemo(
    () => (vaults.data ?? []).map((v) => ({ value: v.id, label: v.title })),
    [vaults.data]
  );
  const visibleItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const all = items.data ?? [];
    return needle
      ? all.filter((item) => item.title.toLowerCase().includes(needle))
      : all;
  }, [items.data, search]);
  const sortedFields = useMemo(
    () =>
      [...(fields.data ?? [])].sort(
        (a, b) => fieldRank(a.fieldType) - fieldRank(b.fieldType)
      ),
    [fields.data]
  );

  const vaultTitle = vaults.data?.find((v) => v.id === vaultId)?.title ?? "";
  const itemTitle = items.data?.find((i) => i.id === itemId)?.title ?? "";
  const loadError = vaults.error ?? items.error ?? fields.error;

  return (
    <FlexColumn gap={SPACING.lg}>
      <FlexRow justify="space-between" align="center" gap={SPACING.md}>
        <Caption>{t("onePassword.connectedAs", { account })}</Caption>
        {canSwitchAccount && (
          <EditorButton
            density="compact"
            variant="text"
            size="small"
            disabled={isDisconnecting}
            onClick={() => void disconnect()}
          >
            {t("onePassword.switchAccount")}
          </EditorButton>
        )}
      </FlexRow>
      {loadError ? (
        <AlertBanner severity="error" compact>
          {t("onePassword.loadFailed", { message: errorText(loadError) })}
        </AlertBanner>
      ) : null}
      {vaults.isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          <SelectField
            label={t("onePassword.vault")}
            value={vaultId ?? ""}
            options={vaultOptions}
            onChange={(value) => {
              setChosenVault(value);
              setItemId(null);
              setSearch("");
            }}
          />
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t("onePassword.searchItems")}
            ariaLabel={t("onePassword.searchItems")}
            size="small"
          />
          <ScrollArea maxHeight={LIST_MAX_HEIGHT}>
            {items.isLoading ? (
              <LoadingSpinner />
            ) : visibleItems.length === 0 ? (
              <Caption>
                {search.trim()
                  ? t("onePassword.noItemsMatch")
                  : t("onePassword.noItems")}
              </Caption>
            ) : (
              <FlexColumn role="listbox" aria-label={t("onePassword.items")}>
                {visibleItems.map((item) => (
                  <SelectableListItem
                    key={item.id}
                    role="option"
                    aria-selected={item.id === itemId}
                    selected={item.id === itemId}
                    onClick={() => setItemId(item.id)}
                  >
                    <Text>{item.title}</Text>
                  </SelectableListItem>
                ))}
              </FlexColumn>
            )}
          </ScrollArea>
          {itemId === null ? (
            <Caption>{t("onePassword.chooseItem")}</Caption>
          ) : fields.isLoading ? (
            <LoadingSpinner />
          ) : sortedFields.length === 0 ? (
            <Caption>{t("onePassword.noFields")}</Caption>
          ) : (
            <FlexColumn role="listbox" aria-label={t("onePassword.fields")}>
              {sortedFields.map((field) => (
                <SelectableListItem
                  key={field.id}
                  role="option"
                  aria-selected={false}
                  onClick={() =>
                    onPick({
                      reference: field.reference,
                      label: [vaultTitle, itemTitle, field.title]
                        .filter(Boolean)
                        .join(" › ")
                    })
                  }
                >
                  <FlexColumn gap={SPACING.micro}>
                    <Text>{field.title}</Text>
                    {field.section && <Caption>{field.section}</Caption>}
                  </FlexColumn>
                </SelectableListItem>
              ))}
            </FlexColumn>
          )}
        </>
      )}
    </FlexColumn>
  );
});

export const OnePasswordPicker = memo(function OnePasswordPicker({
  open,
  onClose,
  onPick
}: OnePasswordPickerProps) {
  const { t } = useTranslation();
  const status = useOnePasswordStatus(open);

  const handlePick = useCallback(
    (pick: OnePasswordPick) => {
      onPick(pick);
      onClose();
    },
    [onPick, onClose]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      title={t("onePassword.title")}
      showActions={false}
      showCloseButton
    >
      {status.isLoading || !status.data ? (
        <LoadingSpinner />
      ) : status.data.canBrowse ? (
        <BrowseStep
          onPick={handlePick}
          account={status.data.account}
          canSwitchAccount={
            status.data.backend === "sdk-desktop" && !status.data.accountFromEnv
          }
        />
      ) : (
        <ConnectStep />
      )}
    </Dialog>
  );
});
