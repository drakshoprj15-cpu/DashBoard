"use client";

import { DASHBOARD_PERIODS, type DashboardPeriod } from "@/features/dashboard/period";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface PeriodSelectorProps {
  value: DashboardPeriod;
  onChange: (period: DashboardPeriod) => void;
}

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Selecionar período"
      className="border-border bg-card inline-flex items-center gap-0.5 rounded-lg border p-0.5"
    >
      {DASHBOARD_PERIODS.map((p) => (
        <Button
          key={p.value}
          type="button"
          size="sm"
          variant="ghost"
          aria-pressed={value === p.value}
          onClick={() => onChange(p.value)}
          className={cn(
            "h-7 px-2.5 text-xs font-medium",
            value === p.value
              ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
              : "text-muted-foreground",
          )}
        >
          {p.label}
        </Button>
      ))}
    </div>
  );
}
