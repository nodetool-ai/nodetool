import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

interface Model {
  id: string;
  name: string;
  provider: string;
}

interface Props {
  models: Model[];
  value: Model | null;
  onChange: (m: Model) => void;
}

export function ModelPicker({ models, value, onChange }: Props) {
  // Group by provider — typical shadcn select pattern.
  const grouped = useMemo(() => {
    const map = new Map<string, Model[]>();
    for (const m of models) {
      const list = map.get(m.provider) ?? [];
      list.push(m);
      map.set(m.provider, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [models]);

  function key(m: Model) {
    return `${m.provider}::${m.id}`;
  }

  return (
    <Select
      value={value ? key(value) : undefined}
      onValueChange={(v) => {
        const [provider, id] = v.split("::");
        const m = models.find((x) => x.provider === provider && x.id === id);
        if (m) onChange(m);
      }}
    >
      <SelectTrigger className="h-8 w-[220px] text-xs">
        <SelectValue placeholder="Select model" />
      </SelectTrigger>
      <SelectContent>
        {grouped.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            No providers configured.
            <br />
            Set API keys, or run the server with{" "}
            <code>NODETOOL_ENABLE_FAKE_PROVIDER=1</code>.
          </div>
        )}
        {grouped.map(([provider, list]) => (
          <SelectGroup key={provider}>
            <SelectLabel className="capitalize">{provider}</SelectLabel>
            {list.map((m) => (
              <SelectItem key={key(m)} value={key(m)}>
                {m.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
