import { formatMoney, formatNumber } from "@/lib/format";
import type { PaymentMethodRow } from "@/features/dashboard/queries";

export interface PaymentMethodsProps {
  methods: PaymentMethodRow[];
  currency: string;
}

export function PaymentMethods({ methods, currency }: PaymentMethodsProps) {
  if (methods.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        Sem dados no período
      </p>
    );
  }

  const totalCents = methods.reduce((s, m) => s + m.amountCents, 0);

  return (
    <ul className="space-y-3">
      {methods.map((m) => {
        const share = totalCents > 0 ? m.amountCents / totalCents : 0;
        return (
          <li key={m.method} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{m.label}</span>
              <span className="text-muted-foreground text-xs">
                {formatNumber(m.count)} {m.count === 1 ? "pagamento" : "pagamentos"}
              </span>
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-all"
                style={{ width: `${Math.max(2, share * 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {(share * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
              </span>
              <span className="font-semibold">
                {formatMoney(m.amountCents, currency, "pt-PT")}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
