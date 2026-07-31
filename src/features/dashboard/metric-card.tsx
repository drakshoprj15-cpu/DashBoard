import type { LucideIcon } from "lucide-react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/format";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface MetricCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  /** Variação vs. período anterior. null = sem base de comparação. */
  changePercent?: number | null;
  /** Explica por que não há valor/variação (ex.: conversão sem sessões). */
  unavailableHint?: string;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  changePercent,
  unavailableHint,
}: MetricCardProps) {
  const hasChange = changePercent !== undefined && changePercent !== null;
  const positive = hasChange && changePercent > 0;
  const negative = hasChange && changePercent < 0;

  return (
    <Card className="gap-2 py-4 transition-colors hover:border-primary/40">
      <CardHeader className="px-4">
        <CardDescription className="flex items-center gap-1.5 text-xs">
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p
          className={cn(
            "mt-1.5 flex items-center gap-1 text-xs font-medium",
            positive && "text-success",
            negative && "text-destructive",
            !positive && !negative && "text-muted-foreground",
          )}
        >
          {hasChange ? (
            <>
              {positive && <TrendingUp className="size-3.5" aria-hidden="true" />}
              {negative && <TrendingDown className="size-3.5" aria-hidden="true" />}
              {!positive && !negative && <Minus className="size-3.5" aria-hidden="true" />}
              <span>
                {positive && "+"}
                {formatPercent(changePercent)}
              </span>
              <span className="text-muted-foreground font-normal">
                vs. período anterior
              </span>
            </>
          ) : unavailableHint ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help underline decoration-dotted underline-offset-2">
                  Sem dados suficientes
                </span>
              </TooltipTrigger>
              <TooltipContent>{unavailableHint}</TooltipContent>
            </Tooltip>
          ) : (
            <span>Sem período anterior para comparar</span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
