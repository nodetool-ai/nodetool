import { Caption, Code, CopyButton, FlexColumn, FlexRow, SPACING } from "../ui_primitives";

export const OAuthCallbackAddress = ({ url }: { url: string | null }) => {
  if (!url) {
    return null;
  }

  return (
    <FlexColumn gap={SPACING.xs}>
      <Caption>Callback URL</Caption>
      <FlexRow align="center" gap={SPACING.xs}>
        <Code sx={{ overflowWrap: "anywhere" }}>{url}</Code>
        <CopyButton value={url} tooltip="Copy callback URL" />
      </FlexRow>
      <Caption>
        Don’t share the URL you’re redirected to after signing in. It may contain a temporary sign-in code.
      </Caption>
    </FlexColumn>
  );
};
