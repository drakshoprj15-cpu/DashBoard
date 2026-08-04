import { describe, expect, it } from "vitest";

import { findActiveSubItem, navigation } from "@/lib/navigation";

describe("navegação do Pushcut", () => {
  const notifications = navigation.find(
    (item) => item.title === "Notificações",
  );

  it("mantém somente o submenu Pushcut na rota canônica", () => {
    expect(notifications?.items).toEqual([
      { title: "Pushcut", href: "/pushcuts" },
    ]);
  });

  it("marca o Pushcut como ativo em /pushcuts", () => {
    expect(findActiveSubItem(notifications?.items ?? [], "/pushcuts")).toEqual({
      title: "Pushcut",
      href: "/pushcuts",
    });
  });

  it("não mantém a antiga opção Todas", () => {
    expect(notifications?.items?.some((item) => item.title === "Todas")).toBe(
      false,
    );
  });
});
