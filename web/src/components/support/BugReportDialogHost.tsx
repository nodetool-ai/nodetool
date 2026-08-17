/**
 * Mounts the bug-report dialog at the app root, so any error surface can open
 * it through BugReportStore without owning a dialog of its own.
 *
 * The host itself is a static import — it must survive a boot failure — while
 * the form behind it loads on first use.
 */
import { lazy, memo, Suspense } from "react";
import { useBugReportStore } from "../../stores/BugReportStore";

const BugReportDialog = lazy(() => import("./BugReportDialog"));

const BugReportDialogHost = () => {
  const context = useBugReportStore((state) => state.context);
  const close = useBugReportStore((state) => state.close);

  if (!context) return null;
  return (
    <Suspense fallback={null}>
      <BugReportDialog context={context} onClose={close} />
    </Suspense>
  );
};

export default memo(BugReportDialogHost);
