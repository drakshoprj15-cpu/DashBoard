"use client";

import { WEBHOOK_EVENTS } from "@/features/webhooks/events-catalog";
import { cn } from "@/lib/utils";

export interface WebhookEventsGridProps {
  selected: string[];
  onChange: (next: string[]) => void;
}

export function WebhookEventsGrid({ selected, onChange }: WebhookEventsGridProps) {
  function toggle(key: string) {
    onChange(
      selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key],
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {WEBHOOK_EVENTS.map((event) => {
        const checked = selected.includes(event.key);
        const Icon = event.icon;
        return (
          <label
            key={event.key}
            className={cn(
              "hover:border-primary/40 flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm transition-colors",
              checked && "border-primary/50 bg-primary/5",
            )}
          >
            <input
              type="checkbox"
              name="events"
              value={event.key}
              checked={checked}
              onChange={() => toggle(event.key)}
              className="accent-primary mt-0.5 size-4 shrink-0"
            />
            <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-medium">{event.label}</p>
              <p className="text-muted-foreground text-xs">{event.description}</p>
            </div>
          </label>
        );
      })}
    </div>
  );
}
