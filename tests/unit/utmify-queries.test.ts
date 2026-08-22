import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  buildUtmifyDateConditions,
  buildUtmifyRecentSaleCondition,
} from "@/features/pixels/utmify-queries";

const dialect = new PgDialect();

describe("consultas UTMify", () => {
  it("serializa datas como parâmetros de timestamp do Postgres", () => {
    const condition = buildUtmifyRecentSaleCondition(
      "paid",
      new Date("2026-08-22T12:00:00.000Z"),
    );

    const query = dialect.sqlToQuery(condition);

    expect(query.params).toEqual(["paid", "2026-08-22T12:00:00.000Z"]);
    expect(query.typings).toEqual(["none", "timestamp"]);
  });

  it("trata a data final como inclusiva e ignora datas inválidas", () => {
    const conditions = buildUtmifyDateConditions({
      from: "2026-08-01",
      to: "2026-08-22",
    });
    const params = conditions.flatMap(
      (condition) => dialect.sqlToQuery(condition).params,
    );

    expect(params).toEqual([
      "2026-08-01T00:00:00.000Z",
      "2026-08-23T00:00:00.000Z",
    ]);
    expect(
      buildUtmifyDateConditions({ from: "2026-02-30", to: "inválida" }),
    ).toEqual([]);
  });
});
