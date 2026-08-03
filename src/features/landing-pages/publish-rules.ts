export interface PublishValidationIssue {
  field: string;
  message: string;
}

/**
 * Regras verificadas antes de deixar publicar.
 *
 * Função pura, em arquivo próprio: o editor a executa no navegador para
 * mostrar a lista de pendências em tempo real, e a server action a executa
 * de novo antes de gravar — a validação do cliente é conveniência, a do
 * servidor é a que vale.
 */
export function validateForPublish(page: {
  slug: string;
  productId: string | null;
  product: { checkoutSlug: string } | null;
  content: { blocks: { type: string; hidden?: boolean }[] };
}): PublishValidationIssue[] {
  const issues: PublishValidationIssue[] = [];
  const visible = page.content.blocks.filter((block) => !block.hidden);

  if (visible.length === 0) {
    issues.push({
      field: "blocos",
      message: "A página não tem nenhum bloco visível.",
    });
  }

  const hasBuyButton = visible.some((block) => block.type === "buy_button");
  const hasProductBlock = visible.some((block) =>
    ["price", "gallery", "variants", "description"].includes(block.type),
  );

  if (page.productId && !hasBuyButton) {
    issues.push({
      field: "checkout",
      message:
        "Sem botão de compra, a página não converte. Adicione o bloco “Botão de compra”.",
    });
  }
  if (hasBuyButton && !page.productId) {
    issues.push({
      field: "produto",
      message:
        "O botão de compra precisa de um produto vinculado para saber o que vender.",
    });
  }
  if (hasBuyButton && page.productId && !page.product?.checkoutSlug) {
    issues.push({
      field: "checkout",
      message: "Não foi possível resolver o checkout deste produto.",
    });
  }
  if (page.productId && !hasProductBlock && !hasBuyButton) {
    issues.push({
      field: "produto",
      message: "Nenhum bloco usa o produto vinculado.",
    });
  }

  return issues;
}
