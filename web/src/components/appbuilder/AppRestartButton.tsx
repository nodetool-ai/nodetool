/**
 * Restart for a running mini app: asks first, then deletes the app's values
 * and results through the runtime and calls `onRestarted`.
 */
import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog, EditorButton } from "../ui_primitives";
import { AppRuntimeContext } from "./runtime/AppRuntimeContext";

interface AppRestartButtonProps {
  onRestarted?: () => void;
}

const AppRestartButton: React.FC<AppRestartButtonProps> = ({ onRestarted }) => {
  const { t } = useTranslation();
  const runtime = React.useContext(AppRuntimeContext);
  const [open, setOpen] = useState(false);
  if (!runtime?.restart) return null;
  const restart = runtime.restart;
  return (
    <>
      <EditorButton variant="text" onClick={() => setOpen(true)} data-testid="app-restart">
        {t("i18n-next8.appBuilder.chatApp.restart")}
      </EditorButton>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          restart();
          onRestarted?.();
        }}
        title={t("i18n-next8.appBuilder.chatApp.restartTitle")}
        content={t("i18n-next8.appBuilder.chatApp.restartBody")}
        confirmText={t("i18n-next8.appBuilder.chatApp.restart")}
        cancelText={t("i18n-next8.appBuilder.chatApp.cancel")}
        destructive
      />
    </>
  );
};

export default AppRestartButton;
