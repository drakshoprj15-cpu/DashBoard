/**
 * Tipos e constantes de segmentação — seguros para o navegador.
 *
 * Vive separado de `segments.ts` porque aquele módulo importa o cliente do
 * banco (postgres/drizzle), que nunca pode entrar no bundle do cliente.
 */

/**
 * "custom" não é um segmento fixo: é uma seleção manual de clientes vinda
 * da aba Carrinhos (`?recipients=id1,id2,...`) — por isso não tem entrada em
 * `SEGMENTS` (não é um card clicável, é resolvido a partir da URL).
 */
export type SegmentKey =
  "paid" | "pending" | "refused" | "no_orders" | "all" | "custom";

export interface SegmentDefinition {
  key: SegmentKey;
  label: string;
  description: string;
}

export const SEGMENTS: SegmentDefinition[] = [
  {
    key: "paid",
    label: "Compras pagas",
    description:
      "Clientes com pedido pago ou pagamento informado na aba Clientes",
  },
  {
    key: "pending",
    label: "Pagamento pendente",
    description:
      "Geraram a referência mas ainda não pagaram — ideal para lembrar",
  },
  {
    key: "refused",
    label: "Pagamento recusado ou expirado",
    description: "Tentaram pagar e não conseguiram",
  },
  {
    key: "no_orders",
    label: "Sem pedidos",
    description: "Estão no cadastro mas nunca iniciaram uma compra",
  },
  { key: "all", label: "Todos os clientes", description: "Toda a base" },
];
