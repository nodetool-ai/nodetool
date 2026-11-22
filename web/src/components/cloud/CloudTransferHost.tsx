/**
 * File > Publish to Cloud and File > Synchronize in the desktop app's main
 * window (technical design WP2.14). The entries are enabled for the window's
 * project when it is a project folder with a full id and the cloud account
 * is signed in. Both open the review sheet, which reads the project's link
 * and publishes or synchronizes from the answer.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { useMenuHandler } from "../../hooks/useIpcRenderer";
import { useProjects } from "../../hooks/useProjects";
import { cloudOriginOf, useCloudAccountState } from "../../lib/cloud/cloudAccount";
import { isCloudWindow } from "../../lib/cloud/cloudWindow";
import { desktopTransferCall, type TransferCall } from "../../lib/cloud/transferCalls";
import { TransferController } from "../../lib/cloud/TransferController";
import { trpcClient } from "../../trpc/client";
import type { MenuEventData } from "../../window";
import CloudTransferSheet from "./CloudTransferSheet";

const FULL_ID = /^[0-9a-f]{32}$/;

const DesktopCloudTransferHost: React.FC<{ call: TransferCall }> = ({ call }) => {
  const account = useCloudAccountState();
  const projectId = useWorkspaceTabsStore((state) => state.activeProjectId);
  const { data: projects } = useProjects();
  const [controller, setController] = useState<TransferController | null>(null);
  const accountRef = useRef(account);
  accountRef.current = account;

  const signedIn = cloudOriginOf(account) !== null;
  const enabled = signedIn && projectId !== null && FULL_ID.test(projectId);
  const projectName = useMemo(
    () => projects?.find((project) => project.id === projectId)?.name ?? "",
    [projects, projectId]
  );

  useEffect(() => {
    window.api?.setMenuCloudTransfer?.(enabled);
  }, [enabled]);

  const handleMenu = useCallback(
    (data: MenuEventData) => {
      if ((data.type !== "publishToCloud" && data.type !== "synchronizeProject") || !enabled || projectId === null) {
        return;
      }
      if (controller !== null) {
        return;
      }
      const next = new TransferController({
        call,
        projectId,
        projectName,
        linked: data.type === "synchronizeProject",
        readLink: true,
        signedIn: () => cloudOriginOf(accountRef.current) !== null,
        collect: (id) => trpcClient.assets.collect.mutate({ project_id: id })
      });
      setController(next);
      void next.start();
    },
    [call, controller, enabled, projectId, projectName]
  );
  useMenuHandler(handleMenu);

  const handleClose = useCallback(() => setController(null), []);
  return controller === null ? null : <CloudTransferSheet controller={controller} onClose={handleClose} />;
};

const CloudTransferHost: React.FC = () => {
  const call = useMemo(() => (isCloudWindow() ? null : desktopTransferCall()), []);
  return call === null ? null : <DesktopCloudTransferHost call={call} />;
};

export default CloudTransferHost;
