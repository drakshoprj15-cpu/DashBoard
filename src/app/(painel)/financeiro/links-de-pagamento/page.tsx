import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Financeiro · Link de pagamento" };

export default function LinksDePagamentoPage() {
  return (
    <ModulePlaceholder
      title="Links de pagamento"
      description="Geração de links /pay/[slug] com produto, preço, cupom, validade, QR Code, compartilhamento no WhatsApp e rastreamento de pagamentos vinculados."
      phase={4}
    />
  );
}
