/**
 * Períodos da Dashboard e cálculo das janelas de tempo (atual vs. anterior
 * equivalente), sempre ancorados em America/Sao_Paulo — os limites de "hoje"
 * e das agregações por dia seguem o fuso do horário comercial da operação,
 * não UTC.
 */

export type DashboardPeriod = "today" | "7d" | "30d" | "90d";

export type ChartGranularity = "hour" | "day" | "week";

export interface PeriodRange {
  /** Início da janela atual (inclusive), em UTC. */
  start: Date;
  /** Fim da janela atual (exclusivo), em UTC — normalmente "agora". */
  end: Date;
  /** Início do período anterior de mesma duração, para comparação. */
  previousStart: Date;
  /** Fim do período anterior (exclusivo) — igual ao `start` atual. */
  previousEnd: Date;
  granularity: ChartGranularity;
}

export const DASHBOARD_PERIODS: {
  value: DashboardPeriod;
  label: string;
}[] = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
];

const TIMEZONE = "America/Sao_Paulo";

/** Meia-noite (00:00) de hoje em America/Sao_Paulo, representada em UTC. */
function startOfTodayInTimezone(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);

  // America/Sao_Paulo é UTC-3 o ano todo (sem horário de verão desde 2019).
  return new Date(Date.UTC(year, month - 1, day, 3, 0, 0, 0));
}

export function resolvePeriodRange(
  period: DashboardPeriod,
  now: Date = new Date(),
): PeriodRange {
  const todayStart = startOfTodayInTimezone(now);
  const DAY_MS = 24 * 60 * 60 * 1000;

  switch (period) {
    case "today":
      return {
        start: todayStart,
        end: now,
        previousStart: new Date(todayStart.getTime() - DAY_MS),
        previousEnd: todayStart,
        granularity: "hour",
      };
    case "7d": {
      const start = new Date(todayStart.getTime() - 6 * DAY_MS);
      const span = now.getTime() - start.getTime();
      return {
        start,
        end: now,
        previousStart: new Date(start.getTime() - span),
        previousEnd: start,
        granularity: "day",
      };
    }
    case "30d": {
      const start = new Date(todayStart.getTime() - 29 * DAY_MS);
      const span = now.getTime() - start.getTime();
      return {
        start,
        end: now,
        previousStart: new Date(start.getTime() - span),
        previousEnd: start,
        granularity: "day",
      };
    }
    case "90d": {
      const start = new Date(todayStart.getTime() - 89 * DAY_MS);
      const span = now.getTime() - start.getTime();
      return {
        start,
        end: now,
        previousStart: new Date(start.getTime() - span),
        previousEnd: start,
        granularity: "week",
      };
    }
  }
}

export function isDashboardPeriod(
  value: string | null,
): value is DashboardPeriod {
  return (
    value === "today" || value === "7d" || value === "30d" || value === "90d"
  );
}

/**
 * Variação percentual entre o valor atual e o do período anterior.
 * Retorna `null` quando não há base de comparação (período anterior zerado)
 * — nunca Infinity/NaN, e nunca inventa uma tendência sem base real.
 */
export function percentChange(
  current: number,
  previous: number,
): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}
