import type { LucideIcon } from "lucide-react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type MetricTone = "rose" | "emerald" | "amber" | "violet";

const TONE_CLASS: Record<MetricTone, string> = {
  rose: "border-fuchsia-300/15 bg-fuchsia-400/10 text-fuchsia-300",
  emerald: "border-emerald-400/15 bg-emerald-400/10 text-emerald-300",
  amber: "border-amber-400/15 bg-amber-400/10 text-amber-300",
  violet: "border-violet-400/15 bg-violet-400/10 text-violet-300",
};

export interface MetricCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: MetricTone;
  changePercent?: number | null;
  unavailableHint?: string;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
  changePercent,
  unavailableHint,
}: MetricCardProps) {
  const hasChange = changePercent !== undefined && changePercent !== null;
  const positive = hasChange && changePercent > 0;
  const negative = hasChange && changePercent < 0;

  return (
    <Card className="min-h-[142px] gap-0 rounded-lg border-white/[0.07] bg-[#141019] py-0 shadow-[0_16px_42px_rgba(6,0,8,0.25)] ring-1 ring-fuchsia-400/[0.02] transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-fuchsia-300/[0.16] hover:shadow-[0_20px_48px_rgba(40,0,28,0.28)] motion-reduce:transform-none">
      <CardContent className="flex h-full flex-col justify-between px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-[#9aa5b5]">{label}</p>
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-md border",
              TONE_CLASS[tone],
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
        </div>

        <div className="mt-4 min-w-0">
          <p className="truncate text-2xl font-semibold text-[#f8fafc] sm:text-[28px]">
            {value}
          </p>
          <div
            className={cn(
              "mt-2 flex min-h-5 items-center gap-1.5 text-xs",
              positive && "text-emerald-300",
              negative && "text-red-300",
              !positive && !negative && "text-[#7f8a9b]",
            )}
          >
            {hasChange ? (
              <>
                {positive ? (
                  <TrendingUp className="size-3.5" aria-hidden="true" />
                ) : null}
                {negative ? (
                  <TrendingDown className="size-3.5" aria-hidden="true" />
                ) : null}
                {!positive && !negative ? (
                  <Minus className="size-3.5" aria-hidden="true" />
                ) : null}
                <span className="font-semibold">
                  {positive ? "+" : ""}
                  {formatPercent(changePercent)}
                </span>
                <span className="text-[#717d8f]">vs. período anterior</span>
              </>
            ) : unavailableHint ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help underline decoration-white/20 underline-offset-4">
                    Sem dados suficientes
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">
                  {unavailableHint}
                </TooltipContent>
              </Tooltip>
            ) : (
              <span>Sem base de comparação</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
