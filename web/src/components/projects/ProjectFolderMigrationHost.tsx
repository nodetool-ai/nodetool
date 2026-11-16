import { useState } from "react";

import { useProjectFolderMigrationStatus } from "../../hooks/useProjectFolderMigration";
import ProjectFolderMigrationDialog from "./ProjectFolderMigrationDialog";
import ProjectFolderMigrationProgress from "./ProjectFolderMigrationProgress";

/**
 * The migration into project folders at the app level: the question before
 * it starts, then one progress surface until the user closes the finished
 * state. Renders nothing where the server migrates without asking: in the
 * cloud, on a production server, and on an install with nothing to move.
 */
const ProjectFolderMigrationHost = () => {
  const { data: status } = useProjectFolderMigrationStatus();
  const [later, setLater] = useState(false);

  if (!status?.applies) {
    return null;
  }
  if (status.state === "not_started" || status.state === "plan_shown") {
    return (
      <ProjectFolderMigrationDialog open={!later} onLater={() => setLater(true)} />
    );
  }
  if (status.state === "done" && status.dismissed) {
    return null;
  }
  return <ProjectFolderMigrationProgress status={status} />;
};

export default ProjectFolderMigrationHost;
