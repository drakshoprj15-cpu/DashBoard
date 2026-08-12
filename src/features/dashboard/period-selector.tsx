"use client";

import { CalendarDays } from "lucide-react";

import {
  DASHBOARD_PERIODS,
  type DashboardPeriod,
} from "@/features/dashboard/period";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const COMPACT_LABEL: Record<DashboardPeriod, string> = {
  today: "Hoje",
  "7d": "7 dias",
  "30d": "30 dias",
  "90d": "90 dias",
};

export interface PeriodSelectorProps {
  value: DashboardPeriod;
  onChange: (period: DashboardPeriod) => void;
}

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <>
      <label className="relative sm:hidden">
        <span className="sr-only">Selecionar período</span>
        <CalendarDays
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#8d98a8]"
          aria-hidden="true"
        />
        <select
          value={value}
          onChange={(event) => onChange(event.target.value as DashboardPeriod)}
          className="h-9 w-full appearance-none rounded-md border border-white/10 bg-white/[0.03] pr-9 pl-9 text-sm font-medium text-[#eadfe7] outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/50"
        >
          {DASHBOARD_PERIODS.map((period) => (
            <option
              key={period.value}
              value={period.value}
              className="bg-[#1a121c]"
            >
              {period.label}
            </option>
          ))}
        </select>
      </label>

      <div
        role="group"
        aria-label="Selecionar período"
        className="hidden h-9 items-center gap-0.5 rounded-md border border-white/10 bg-white/[0.03] p-0.5 sm:inline-flex"
      >
        {DASHBOARD_PERIODS.map((period) => (
          <Button
            key={period.value}
            type="button"
            size="sm"
            variant="ghost"
            aria-pressed={value === period.value}
            onClick={() => onChange(period.value)}
            className={cn(
              "h-7 rounded-sm px-2.5 text-xs font-medium",
              value === period.value
                ? "bg-[#e91e8f] text-white shadow-[0_6px_18px_rgba(233,30,143,0.28)] hover:bg-[#e91e8f] hover:text-white"
                : "text-[#a596a2] hover:bg-fuchsia-400/[0.08] hover:text-[#fff7fb]",
            )}
          >
            {COMPACT_LABEL[period.value]}
          </Button>
        ))}
      </div>
    </>
  );
}
