import { memo } from "react";

import { useGitHubStarPrompt } from "../../hooks/useGitHubStarPrompt";

/**
 * Mount point for the one-time GitHub star invitation. Renders nothing; the
 * hook counts active use for the whole session and raises a toast once.
 */
const GitHubStarPrompt: React.FC = () => {
  useGitHubStarPrompt();
  return null;
};

export default memo(GitHubStarPrompt);
