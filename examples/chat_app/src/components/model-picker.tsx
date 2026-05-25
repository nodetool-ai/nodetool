import { useMemo, useState } from "react";
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
  loading?: boolean;
}

export function ModelPicker({ models, value, onChange, loading }: Props) {
  const [query, setQuery] = useState("");
  const filteredModels = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q)
    );
  }, [models, query]);

  // Group by provider — typical shadcn select pattern.
  const grouped = useMemo(() => {
    const map = new Map<string, Model[]>();
    for (const m of filteredModels) {
      const list = map.get(m.provider) ?? [];
      list.push(m);
      map.set(m.provider, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredModels]);

  function key(m: Model) {
    return `${m.provider}::${m.id}`;
  }

  return (
    <Select
      value={value ? key(value) : undefined}
      disabled={loading}
      onValueChange={(v) => {
        const [provider, id] = v.split("::");
        const m = models.find((x) => x.provider === provider && x.id === id);
        if (m) onChange(m);
      }}
    >
      <SelectTrigger className="h-8 w-[220px] text-xs">
        <SelectValue
          placeholder={loading ? "Loading models…" : "Select model"}
        />
      </SelectTrigger>
      <SelectContent>
        {models.length > 8 && (
          <div className="p-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models…"
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}
        {grouped.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            {models.length === 0
              ? "No providers configured."
              : "No models match your search."}
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
