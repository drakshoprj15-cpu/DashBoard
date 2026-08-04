import { formatNumber, formatPercent } from "@/lib/format";
import type { FunnelStepRow } from "@/features/dashboard/queries";

export interface SalesFunnelProps {
  steps: FunnelStepRow[];
}

export function SalesFunnel({ steps }: SalesFunnelProps) {
  const maxCount = Math.max(1, ...steps.map((s) => s.count));
  const hasAnyData = steps.some((s) => s.count > 0);

  return (
    <div className="space-y-3">
      {steps.map((step, i) => {
        const prev = i > 0 ? steps[i - 1] : null;
        const widthPercent = Math.max(4, (step.count / maxCount) * 100);
        const dropRate =
          prev && prev.count > 0 ? 1 - step.count / prev.count : null;

        return (
          <div key={step.event} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{step.label}</span>
              <span className="flex items-center gap-2">
                <span className="font-bold">
                  {hasAnyData ? formatNumber(step.count) : "Sem dados"}
                </span>
                {dropRate !== null && dropRate > 0 && (
                  <span className="text-destructive text-xs">
                    −{formatPercent(dropRate)}
                  </span>
                )}
              </span>
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{ width: hasAnyData ? `${widthPercent}%` : "0%" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
