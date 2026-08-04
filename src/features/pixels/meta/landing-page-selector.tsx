"use client";

import { useMemo, useState } from "react";
import { Layers, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export interface LandingPagePickerItem {
  id: string;
  name: string;
  publicName: string | null;
  slug: string;
  productName: string | null;
  status: string;
}

interface LandingPageSelectorProps {
  items: LandingPagePickerItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function LandingPageSelector({
  items,
  selectedId,
  onSelect,
}: LandingPageSelectorProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...items].sort((a, b) =>
      (a.publicName ?? a.name).localeCompare(b.publicName ?? b.name),
    );
    if (!q) return sorted;
    return sorted.filter((item) =>
      [item.name, item.publicName, item.slug, item.productName]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q)),
    );
  }, [items, query]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="Nenhuma landing page encontrada"
        description="Crie uma landing page para configurar pixels Meta específicos dela."
        className="min-h-[160px]"
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          placeholder="Buscar por nome, produto ou slug…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-1">
        {filtered.length === 0 ? (
          <p className="text-muted-foreground p-3 text-sm">
            Nenhuma landing page corresponde à busca.
          </p>
        ) : (
          filtered.map((item) => {
            const label = item.publicName || item.name;
            const active = item.id === selectedId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted",
                )}
              >
                <span className="font-medium">
                  {item.productName ? `${item.productName} — ` : ""}
                  {label}
                </span>
                <span className="flex items-center gap-2 text-xs opacity-80">
                  <span className="font-mono">/lp/{item.slug}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {item.status}
                  </Badge>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
