import { describe, expect, it } from "vitest";

import { validatePushcutWebhookUrl } from "@/features/notifications/pushcut";

const VALID = "https://api.pushcut.io/AbC123SecretXyz/notifications/Venda%20Aprovada";

describe("validatePushcutWebhookUrl", () => {
  it("aceita uma URL de webhook Pushcut válida", () => {
    const result = validatePushcutWebhookUrl(VALID);
    expect(result.ok).toBe(true);
    expect(result.notificationName).toBe("Venda Aprovada");
    expect(result.secret).toBe("AbC123SecretXyz");
    expect(result.maskedUrl).toBe(
      "https://api.pushcut.io/••••••••/notifications/Venda%20Aprovada",
    );
  });

  it("rejeita string vazia", () => {
    expect(validatePushcutWebhookUrl("").ok).toBe(false);
    expect(validatePushcutWebhookUrl("   ").ok).toBe(false);
  });

  it("rejeita URL inválida", () => {
    expect(validatePushcutWebhookUrl("não é uma url").ok).toBe(false);
  });

  it("rejeita protocolo diferente de https", () => {
    const result = validatePushcutWebhookUrl(
      "http://api.pushcut.io/secret/notifications/Venda",
    );
    expect(result.ok).toBe(false);
  });

  it("rejeita esquemas perigosos", () => {
    expect(validatePushcutWebhookUrl("javascript:alert(1)").ok).toBe(false);
    expect(validatePushcutWebhookUrl("file:///etc/passwd").ok).toBe(false);
    expect(validatePushcutWebhookUrl("data:text/plain,oi").ok).toBe(false);
  });

  it("rejeita hostname diferente de api.pushcut.io (sem usar includes frágil)", () => {
    expect(
      validatePushcutWebhookUrl(
        "https://evil-api.pushcut.io.attacker.com/secret/notifications/Venda",
      ).ok,
    ).toBe(false);
    expect(
      validatePushcutWebhookUrl(
        "https://attacker.com/api.pushcut.io/notifications/Venda",
      ).ok,
    ).toBe(false);
    expect(
      validatePushcutWebhookUrl("https://sub.api.pushcut.io/secret/notifications/Venda")
        .ok,
    ).toBe(false);
  });

  it("rejeita localhost e IPs internos", () => {
    expect(
      validatePushcutWebhookUrl("https://localhost/secret/notifications/Venda").ok,
    ).toBe(false);
    expect(
      validatePushcutWebhookUrl("https://127.0.0.1/secret/notifications/Venda").ok,
    ).toBe(false);
    expect(
      validatePushcutWebhookUrl("https://169.254.169.254/secret/notifications/Venda")
        .ok,
    ).toBe(false);
  });

  it("rejeita credenciais embutidas na URL", () => {
    const result = validatePushcutWebhookUrl(
      "https://user:pass@api.pushcut.io/secret/notifications/Venda",
    );
    expect(result.ok).toBe(false);
  });

  it("rejeita porta personalizada", () => {
    const result = validatePushcutWebhookUrl(
      "https://api.pushcut.io:8443/secret/notifications/Venda",
    );
    expect(result.ok).toBe(false);
  });

  it("rejeita query string e fragmento", () => {
    expect(
      validatePushcutWebhookUrl(
        "https://api.pushcut.io/secret/notifications/Venda?x=1",
      ).ok,
    ).toBe(false);
    expect(
      validatePushcutWebhookUrl("https://api.pushcut.io/secret/notifications/Venda#x")
        .ok,
    ).toBe(false);
  });

  it("rejeita caminho sem segredo ou sem nome de notificação", () => {
    expect(
      validatePushcutWebhookUrl("https://api.pushcut.io/notifications/Venda").ok,
    ).toBe(false);
    expect(
      validatePushcutWebhookUrl("https://api.pushcut.io/secret/notifications/").ok,
    ).toBe(false);
    expect(validatePushcutWebhookUrl("https://api.pushcut.io/secret").ok).toBe(false);
  });

  it("aceita (com aviso, não bloqueia) nome de notificação com espaço extra no fim", () => {
    // Nome real registado assim no Pushcut continua tendo de funcionar —
    // bloquear aqui derrubaria uma URL que é válida do lado do Pushcut.
    const result = validatePushcutWebhookUrl(
      "https://api.pushcut.io/secret/notifications/Venda%20Aprovada%20",
    );
    expect(result.ok).toBe(true);
    expect(result.warning).toMatch(/espaço/i);
    // A URL enviada de facto tem de preservar o espaço, sem "corrigir" nada.
    expect(result.normalizedUrl).toBe(
      "https://api.pushcut.io/secret/notifications/Venda%20Aprovada%20",
    );
  });

  it("aceita (com aviso, não bloqueia) nome de notificação com espaço extra no início", () => {
    const result = validatePushcutWebhookUrl(
      "https://api.pushcut.io/secret/notifications/%20Venda",
    );
    expect(result.ok).toBe(true);
    expect(result.warning).toMatch(/espaço/i);
  });
});
