import { describe, expect, it } from "vitest";

import { maskTokenPreview } from "@/lib/crypto";

describe("maskTokenPreview", () => {
  it("mascara um token real mantendo início e fim visíveis", () => {
    const masked = maskTokenPreview("EAAJZAxxxxxxxxxxxxxxxxxxxxxxxxX9");
    expect(masked.startsWith("EAAJ")).toBe(true);
    expect(masked.endsWith("X9")).toBe(true);
    expect(masked).toContain("***");
    // O token completo nunca sobrevive na prévia.
    expect(masked).not.toContain("xxxxxxxxxxxxxxxxxxxxxxxx");
  });

  it("strings curtas ficam totalmente ocultas", () => {
    expect(maskTokenPreview("abc")).toBe("•••");
    expect(maskTokenPreview("abcdef")).toBe("••••••");
  });

  it("string vazia devolve vazio", () => {
    expect(maskTokenPreview("")).toBe("");
    expect(maskTokenPreview("   ")).toBe("");
  });
});
