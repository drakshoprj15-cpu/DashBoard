import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getDb } from "@/database/client";
import { pixelEvents, pixels } from "@/database/schema";
import { getOrCreateDefaultWorkspace } from "@/lib/workspace";

/**
 * Integração: confirma a idempotência real contra o Postgres — o índice
 * único `(pixelId, eventId, channel)` em `pixel_events` é a garantia de que
 * um pedido nunca gera dois `Purchase` para o mesmo pixel, não importa
 * quantas vezes o webhook seja reentregue ou o checkout reenviado.
 *
 * Roda tudo dentro de uma transação que é sempre revertida no final (mesmo
 * quando as asserções passam) — nunca deixa dados de teste no banco real.
 * Só corre quando há DATABASE_URL/DIRECT_URL no ambiente, mesmo padrão de
 * `tests/integration/carts-queries.test.ts`.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL ?? process.env.DIRECT_URL);

class RollbackForTest extends Error {}

describe.skipIf(!hasDatabase)(
  "pixel_events — dedupe real contra o banco",
  { timeout: 30_000 },
  () => {
    it("o índice único (pixelId, eventId, channel) bloqueia um segundo envio do mesmo evento", async () => {
      const db = getDb();

      await expect(
        db.transaction(async (tx) => {
          const workspaceId = await getOrCreateDefaultWorkspace();

          const [pixel] = await tx
            .insert(pixels)
            .values({
              workspaceId,
              name: "[teste] dedupe pixel_events",
              type: "meta_capi",
              pixelId: "999999999999999",
              isActive: false,
            })
            .returning({ id: pixels.id });

          const eventId = `purchase_test_${randomUUID()}`;

          const first = await tx
            .insert(pixelEvents)
            .values({
              workspaceId,
              pixelId: pixel.id,
              eventName: "Purchase",
              eventId,
              channel: "server",
              status: "pending",
            })
            .onConflictDoNothing()
            .returning({ id: pixelEvents.id });

          // Simula o webhook reentregando o mesmo evento (at-least-once).
          const second = await tx
            .insert(pixelEvents)
            .values({
              workspaceId,
              pixelId: pixel.id,
              eventName: "Purchase",
              eventId,
              channel: "server",
              status: "pending",
            })
            .onConflictDoNothing()
            .returning({ id: pixelEvents.id });

          expect(first).toHaveLength(1);
          expect(second).toHaveLength(0);

          const rows = await tx
            .select()
            .from(pixelEvents)
            .where(
              and(
                eq(pixelEvents.pixelId, pixel.id),
                eq(pixelEvents.eventId, eventId),
              ),
            );
          expect(rows).toHaveLength(1);

          // Força o rollback — nada deste teste persiste no banco real.
          throw new RollbackForTest();
        }),
      ).rejects.toBeInstanceOf(RollbackForTest);
    });
  },
);
