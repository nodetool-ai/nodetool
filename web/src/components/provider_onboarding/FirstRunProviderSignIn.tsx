import { memo } from "react";

import { useFirstRunProviderSignIn } from "../../hooks/useFirstRunProviderSignIn";

/**
 * Mount point for the first-run sign-in offer. Renders nothing — it exists so
 * the hook runs for the whole session next to the dialog it opens.
 */
const FirstRunProviderSignIn: React.FC = () => {
  useFirstRunProviderSignIn();
  return null;
};

export default memo(FirstRunProviderSignIn);
