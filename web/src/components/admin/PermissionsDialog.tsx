import React, { memo, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  ADMIN_PERMISSION_FLAGS,
  type AdminPermissionFlag,
  type AdminPermissionOverrides
} from "../../serverState/useAdminUsers";
import {
  AlertBanner,
  Caption,
  Dialog,
  FlexColumn,
  FlexRow,
  GAP,
  Text,
  ToggleGroup,
  ToggleOption
} from "../ui_primitives";

/** "inherit" follows the level below: the default for a user, allowed for the default. */
type Choice = "inherit" | "allow" | "block";

export interface PermissionsDialogProps {
  open: boolean;
  title: string;
  /** The flags this level sets now. */
  overrides: AdminPermissionOverrides;
  /**
   * For one user: what each flag is when they follow the default. Adds a
   * "Default" choice per flag. Left out for the default itself.
   */
  inherited?: Record<AdminPermissionFlag, boolean>;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (overrides: AdminPermissionOverrides) => void;
}

const toChoice = (value: boolean | undefined): Choice =>
  value === undefined ? "inherit" : value ? "allow" : "block";

const toChoices = (
  overrides: AdminPermissionOverrides
): Record<AdminPermissionFlag, Choice> =>
  Object.fromEntries(
    ADMIN_PERMISSION_FLAGS.map((flag) => [flag, toChoice(overrides[flag])])
  ) as Record<AdminPermissionFlag, Choice>;

/**
 * Turn permission flags on or off, for every user or for one. For one user a
 * flag can also follow the default, which is what it does until changed.
 */
const PermissionsDialog: React.FC<PermissionsDialogProps> = ({
  open,
  title,
  overrides,
  inherited,
  saving,
  error,
  onClose,
  onSave
}) => {
  const { t } = useTranslation();
  const [choices, setChoices] = useState(() => toChoices(overrides));

  useEffect(() => {
    if (open) setChoices(toChoices(overrides));
  }, [open, overrides]);

  const choose = useCallback((flag: AdminPermissionFlag, value: unknown) => {
    if (value !== "inherit" && value !== "allow" && value !== "block") return;
    setChoices((current) => ({ ...current, [flag]: value }));
  }, []);

  const handleSave = useCallback(() => {
    const next: AdminPermissionOverrides = {};
    for (const flag of ADMIN_PERMISSION_FLAGS) {
      const choice = choices[flag];
      // The default has no level below it: "allow" is what an unset flag means.
      if (choice === "block") next[flag] = false;
      else if (choice === "allow" && inherited) next[flag] = true;
    }
    onSave(next);
  }, [choices, inherited, onSave]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      showActions
      onConfirm={handleSave}
      confirmText={t("admin.permissions.save")}
      cancelText={t("admin.permissions.cancel")}
      isLoading={saving}
    >
      <FlexColumn gap={GAP.normal}>
        <Caption>
          {inherited
            ? t("admin.permissions.userIntro")
            : t("admin.permissions.defaultIntro")}
        </Caption>
        {ADMIN_PERMISSION_FLAGS.map((flag) => {
          const choice =
            !inherited && choices[flag] === "inherit" ? "allow" : choices[flag];
          return (
            <FlexRow key={flag} gap={GAP.normal} align="center" justify="space-between" wrap>
              <FlexColumn gap={GAP.none} sx={{ flex: 1, minWidth: 0 }}>
                <Text id={`permission-${flag}`}>
                  {t(`admin.permissions.flags.${flag}.label`)}
                </Text>
                <Caption>{t(`admin.permissions.flags.${flag}.description`)}</Caption>
              </FlexColumn>
              <ToggleGroup
                value={choice}
                exclusive
                segmented
                aria-labelledby={`permission-${flag}`}
                onChange={(_event, value) => choose(flag, value)}
              >
                {inherited ? (
                  <ToggleOption value="inherit">
                    {inherited[flag]
                      ? t("admin.permissions.defaultAllowed")
                      : t("admin.permissions.defaultBlocked")}
                  </ToggleOption>
                ) : null}
                <ToggleOption value="allow">{t("admin.permissions.allow")}</ToggleOption>
                <ToggleOption value="block">{t("admin.permissions.block")}</ToggleOption>
              </ToggleGroup>
            </FlexRow>
          );
        })}
        <Caption>{t("admin.permissions.adminNote")}</Caption>
        {error ? (
          <AlertBanner severity="error" compact>
            {error}
          </AlertBanner>
        ) : null}
      </FlexColumn>
    </Dialog>
  );
};

export default memo(PermissionsDialog);
