/**
 * FontPicker — choose the family a text clip or a caption is set in.
 *
 * The list is ordered the way the endpoint returns it: the families NodeTool
 * ships first, then whatever this machine has installed. Bundled ones are
 * marked portable, because that is the difference that matters at render time
 * — a bundled family draws identically in this preview, in an export and on
 * the server, and a system one resolves against each host's own fonts (D8,
 * F15). The validator reports the same thing as `font_not_portable`.
 */

import React, { memo, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { trpcClient } from "../../../trpc/client";
import { InspectorSelect } from "./InspectorPrimitives";
import type { SelectOption } from "../../ui_primitives";

/** The empty option's value: "whatever the renderer defaults to". */
const DEFAULT_VALUE = "";

interface FontPickerProps {
  /** Accessible name — the visible label lives on the enclosing row. */
  label: string;
  /** The clip's own `fontFamily`, or undefined for the default. */
  value: string | undefined;
  /** Called with the chosen family, or undefined for the default. */
  onChange: (family: string | undefined) => void;
}

export const FontPicker: React.FC<FontPickerProps> = memo(
  ({ label, value, onChange }) => {
    const { data } = useQuery({
      queryKey: ["fonts"],
      queryFn: () => trpcClient.fonts.list.query(),
      // A machine's installed fonts do not change during a session, and the
      // Linux scan walks /usr/share/fonts recursively.
      staleTime: Number.POSITIVE_INFINITY
    });

    const options = useMemo<SelectOption[]>(() => {
      const listed = (data?.fonts ?? []).map((font) => ({
        value: font.name,
        label: font.portable ? `${font.name} · portable` : font.name
      }));
      // A document authored elsewhere can name a family this machine has
      // neither bundled nor installed. Without an option for it the select
      // would show the default and silently rewrite the clip on the next edit.
      const known = new Set(listed.map((option) => option.value));
      const unknown =
        value !== undefined && value !== "" && !known.has(value)
          ? [{ value, label: `${value} · not installed` }]
          : [];
      return [
        { value: DEFAULT_VALUE, label: "Default (Inter)" },
        ...listed,
        ...unknown
      ];
    }, [data, value]);

    return (
      <InspectorSelect
        label={label}
        value={value ?? DEFAULT_VALUE}
        options={options}
        onChange={(next) => onChange(next === DEFAULT_VALUE ? undefined : next)}
        grow
      />
    );
  }
);
FontPicker.displayName = "FontPicker";
