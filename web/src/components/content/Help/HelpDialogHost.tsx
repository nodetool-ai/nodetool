import { lazy, Suspense } from "react";
import { useAppHeaderStore } from "../../../stores/AppHeaderStore";
import { Dialog, LoadingSpinner } from "../../ui_primitives";

const Help = lazy(() => import("./Help"));

/** One app-level host survives navigation sheet and menu dismissal. */
const HelpDialogHost = () => {
  const open = useAppHeaderStore((state) => state.helpOpen);
  const close = useAppHeaderStore((state) => state.handleCloseHelp);
  // The first open loads the Help module. The dialog opens at once so the
  // click that closed the menu visibly did something.
  return open ? (
    <Suspense
      fallback={
        <Dialog open onClose={close} title="Help" fullWidth maxWidth="lg">
          <LoadingSpinner text="Loading help" />
        </Dialog>
      }
    >
      <Help open={open} handleClose={close} />
    </Suspense>
  ) : null;
};

export default HelpDialogHost;
