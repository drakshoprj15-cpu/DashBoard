import { describe, expect, it } from "vitest";

import { pickEffectivePixels } from "@/features/pixels/fallback";

interface Candidate {
  id: string;
  landingPageId: string | null;
  isActive: boolean;
}

const LP_A = "landing-a";
const LP_B = "landing-b";

describe("pickEffectivePixels", () => {
  it("usa os pixels específicos da landing page quando existem ativos", () => {
    const candidates: Candidate[] = [
      { id: "global-1", landingPageId: null, isActive: true },
      { id: "lp-a-1", landingPageId: LP_A, isActive: true },
    ];

    const result = pickEffectivePixels(candidates, LP_A);
    expect(result.map((p) => p.id)).toEqual(["lp-a-1"]);
  });

  it("cai para os pixels globais quando a landing page não tem nenhum ativo", () => {
    const candidates: Candidate[] = [
      { id: "global-1", landingPageId: null, isActive: true },
      { id: "lp-a-1", landingPageId: LP_A, isActive: false },
    ];

    const result = pickEffectivePixels(candidates, LP_A);
    expect(result.map((p) => p.id)).toEqual(["global-1"]);
  });

  it("nunca mistura pixels de landing pages diferentes", () => {
    const candidates: Candidate[] = [
      { id: "lp-a-1", landingPageId: LP_A, isActive: true },
      { id: "lp-b-1", landingPageId: LP_B, isActive: true },
      { id: "global-1", landingPageId: null, isActive: true },
    ];

    const result = pickEffectivePixels(candidates, LP_A);
    expect(result.map((p) => p.id)).toEqual(["lp-a-1"]);
  });

  it("sem landing page, usa só os globais ativos", () => {
    const candidates: Candidate[] = [
      { id: "global-1", landingPageId: null, isActive: true },
      { id: "global-2", landingPageId: null, isActive: false },
      { id: "lp-a-1", landingPageId: LP_A, isActive: true },
    ];

    const result = pickEffectivePixels(candidates, null);
    expect(result.map((p) => p.id)).toEqual(["global-1"]);
  });

  it("ignora pixels específicos desativados mesmo sem fallback global ativo", () => {
    const candidates: Candidate[] = [
      { id: "lp-a-1", landingPageId: LP_A, isActive: false },
    ];
    expect(pickEffectivePixels(candidates, LP_A)).toEqual([]);
  });
});
