import type { Metadata } from "next";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const metadata: Metadata = { title: "Catálogo · Produtos" };

export default function ProdutosPage() {
  return (
    <ModulePlaceholder
      title="Produtos"
      description="Produtos físicos, digitais e serviços com variações, galeria, SEO, preços promocionais, arquivos digitais com entrega segura e ações rápidas (criar checkout, gerar link de pagamento)."
      phase={2}
    />
  );
}
