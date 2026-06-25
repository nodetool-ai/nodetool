/**
 * BuiltinPacksSection — the "Included node packs" block of the Package Manager.
 *
 * Lists the first-party packs that ship with NodeTool and lets the user enable
 * or disable each (required packs are locked on). Backed by the server `packs`
 * tRPC router via {@link usePacksStore}, so it works in both the desktop app
 * and the browser; the server applies each toggle to its live registry and the
 * store refetches node metadata, so changes take effect without a restart.
 */
import { memo, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  AlertBanner,
  BORDER_RADIUS,
  Chip,
  FlexColumn,
  FlexRow,
  LabeledSwitch,
  Text
} from "../ui_primitives";
import usePacksStore from "../../stores/PacksStore";

const BuiltinPacksSection = () => {
  const { builtins, error, fetchBuiltins, setBuiltinEnabled } = usePacksStore(
    useShallow((s) => ({
      builtins: s.builtins,
      error: s.error,
      fetchBuiltins: s.fetchBuiltins,
      setBuiltinEnabled: s.setBuiltinEnabled
    }))
  );

  useEffect(() => {
    void fetchBuiltins();
  }, [fetchBuiltins]);

  return (
    <FlexColumn gap={1.5}>
      <FlexColumn gap={0.5}>
        <Text size="normal" weight={600}>
          Included node packs
        </Text>
        <Text size="small" color="secondary">
          These packs ship with NodeTool. Only the essentials are enabled out of
          the box — turn on the providers you use to add their nodes to the
          editor.
        </Text>
      </FlexColumn>

      {error && (
        <AlertBanner severity="error" compact>
          {error}
        </AlertBanner>
      )}

      <FlexColumn gap={1}>
        {builtins.map((pack) => (
          <FlexRow
            key={pack.id}
            gap={1.5}
            align="center"
            justify="space-between"
            sx={{
              p: 1.5,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: BORDER_RADIUS.xs
            }}
          >
            <FlexColumn gap={0.25} sx={{ minWidth: 0, flex: 1 }}>
              <FlexRow gap={1} align="center">
                <Text size="normal" weight={600} truncate>
                  {pack.name}
                </Text>
                {pack.required && <Chip label="Always on" compact />}
              </FlexRow>
              <Text size="small" color="secondary">
                {pack.description}
              </Text>
            </FlexColumn>
            <LabeledSwitch
              label={pack.enabled ? "Enabled" : "Disabled"}
              checked={pack.enabled}
              disabled={pack.required}
              onChange={(next) => void setBuiltinEnabled(pack.id, next)}
            />
          </FlexRow>
        ))}
        {builtins.length === 0 && (
          <Text size="small" color="secondary">
            No built-in packs reported.
          </Text>
        )}
      </FlexColumn>
    </FlexColumn>
  );
};

export default memo(BuiltinPacksSection);
