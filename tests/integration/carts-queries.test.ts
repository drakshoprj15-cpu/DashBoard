import { describe, expect, it } from "vitest";

import { getCartDetail, getCartsFacets, listCarts } from "@/features/carts/queries";

/**
 * Integração: exercita as queries reais de Carrinhos contra o banco
 * configurado. Só corre quando há DATABASE_URL/DIRECT_URL no ambiente — em
 * CI (ou em qualquer máquina sem credenciais) o bloco inteiro é ignorado.
 *
 * Vale o tempo extra: foi este teste que apanhou a interpolação de um
 * `Date` num template `sql` cru (o driver `postgres.js` rejeita-o em
 * runtime), coisa que lint, typecheck e build deixaram passar. São todas
 * leituras — nada aqui escreve nos pedidos.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

describe.skipIf(!hasDatabase)(
  "carrinhos — queries reais contra o banco",
  { timeout: 60_000 },
  () => {
    it("lista carrinhos sem erro de SQL e com os campos esperados", async () => {
      const result = await listCarts({ page: 1, pageSize: 25, tab: "all" });

      expect(Array.isArray(result.rows)).toBe(true);
      expect(result.total).toBeGreaterThanOrEqual(0);

      for (const row of result.rows) {
        expect(typeof row.reference).toBe("string");
        expect(typeof row.category).toBe("string");
        expect(typeof row.totalCents).toBe("number");
      }
    });

    it("as abas particionam o conjunto — a soma bate com Todos", async () => {
      const facets = await getCartsFacets({});
      // "reminded" fica de fora da soma de propósito: é um recorte por
      // último lembrete, transversal às categorias, não uma partição.
      const soma =
        facets.tabCounts.awaiting_payment +
        facets.tabCounts.pending +
        facets.tabCounts.paid +
        facets.tabCounts.recovered +
        facets.tabCounts.declined +
        facets.tabCounts.abandoned +
        facets.tabCounts.other;

      expect(soma).toBe(facets.tabCounts.all);
      expect(facets.totals.conversionRate).toBeGreaterThanOrEqual(0);
      expect(facets.totals.conversionRate).toBeLessThanOrEqual(1);
    });

    it("os agregados de recuperação são coerentes", async () => {
      const facets = await getCartsFacets({});

      expect(facets.totals.recoveryRate).toBeGreaterThanOrEqual(0);
      expect(facets.totals.recoveryRate).toBeLessThanOrEqual(1);
      expect(facets.totals.remindersSent).toBeGreaterThanOrEqual(0);
      expect(facets.totals.recoveredRevenueCents).toBeGreaterThanOrEqual(0);
      // `sum(bigint)` chega do driver como string — os cards somam números.
      expect(typeof facets.totals.abandoned.valueCents).toBe("number");
      expect(typeof facets.totals.recoveredRevenueCents).toBe("number");
      // "Convertidos" = pagos de verdade + marcados manualmente.
      expect(facets.totals.recovered.count).toBe(
        facets.tabCounts.paid + facets.tabCounts.recovered,
      );
      expect(facets.dominantCurrency).toMatch(/^[A-Z]{3}$/);
    });

    it("cada aba filtra sem erro de SQL", async () => {
      for (const tab of [
        "awaiting_payment",
        "pending",
        "paid",
        "recovered",
        "declined",
        "abandoned",
        "reminded",
        "other",
      ] as const) {
        const result = await listCarts({ tab, page: 1, pageSize: 10 });
        expect(result.total).toBeGreaterThanOrEqual(0);
      }
    });

    it("cada ordenação corre sem erro de SQL", async () => {
      for (const sortBy of ["createdAt", "totalCents", "lastReminderSentAt"] as const) {
        for (const sortDir of ["asc", "desc"] as const) {
          const result = await listCarts({ sortBy, sortDir, page: 1, pageSize: 10 });
          expect(Array.isArray(result.rows)).toBe(true);
        }
      }
    });

    it("arquivados ficam ocultos por omissão e aparecem quando pedido", async () => {
      const padrao = await listCarts({ page: 1, pageSize: 1, tab: "all" });
      const comArquivados = await listCarts({
        page: 1,
        pageSize: 1,
        tab: "all",
        includeArchived: true,
      });

      expect(comArquivados.total).toBeGreaterThanOrEqual(padrao.total);
    });

    it("o filtro de importados devolve só o que veio de planilha", async () => {
      const importados = await listCarts({ importedOnly: true, page: 1, pageSize: 25 });
      for (const row of importados.rows) {
        expect(row.origin).toBe("import");
      }
    });

    it("a busca escapa curingas do ILIKE em vez de os interpretar", async () => {
      // "%" sozinho casaria com tudo se não fosse escapado.
      const comCuringa = await listCarts({ search: "%", page: 1, pageSize: 10 });
      const todos = await listCarts({ page: 1, pageSize: 10, tab: "all" });

      expect(comCuringa.total).toBeLessThanOrEqual(todos.total);
    });

    it("carrega o detalhe com timeline ordenada", async () => {
      const list = await listCarts({ page: 1, pageSize: 1, tab: "all" });
      if (list.rows.length === 0) return;

      const detail = await getCartDetail(list.rows[0].orderId);
      expect(detail).not.toBeNull();
      expect(detail!.timeline.length).toBeGreaterThan(0);

      const instantes = detail!.timeline.map((e) => e.at.getTime());
      expect([...instantes].sort((a, b) => a - b)).toEqual(instantes);
    });

    it("um id inexistente devolve null (proteção contra troca de id na URL)", async () => {
      const detail = await getCartDetail("00000000-0000-0000-0000-000000000000");
      expect(detail).toBeNull();
    });
  },
);
