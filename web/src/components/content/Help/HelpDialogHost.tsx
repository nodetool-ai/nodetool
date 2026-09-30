import { lazy, Suspense } from "react";
import { useAppHeaderStore } from "../../../stores/AppHeaderStore";

const Help = lazy(() => import("./Help"));

/** One app-level host survives navigation sheet and menu dismissal. */
const HelpDialogHost = () => {
  const open = useAppHeaderStore((state) => state.helpOpen);
  const close = useAppHeaderStore((state) => state.handleCloseHelp);
  return open ? (
    <Suspense fallback={null}>
      <Help open={open} handleClose={close} />
    </Suspense>
  ) : null;
};

export default HelpDialogHost;
