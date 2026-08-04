/**
 * Camada de recuperação via WhatsApp.
 *
 * Hoje existe uma única implementação — `manual` —, que **não envia nada**:
 * monta a mensagem, abre o `wa.me` no navegador do operador e regista o
 * evento quando ele confirma. Isso é deliberado: disparo automático de
 * WhatsApp/SMS custa dinheiro por mensagem e exige conta aprovada, então
 * nunca pode acontecer sem configuração explícita do dono da operação.
 *
 * A interface abaixo existe para que integrar Twilio, Zenvia ou a WhatsApp
 * Cloud API depois seja acrescentar um provider e uma variável de ambiente,
 * sem tocar na página — mesma forma do adaptador de e-mail em
 * `features/emails/resend-provider.ts`.
 */
import { normalizePhone, whatsAppUrl } from "@/features/carts/phone";

export interface WhatsAppMessage {
  phone: string;
  body: string;
}

export interface WhatsAppSendResult {
  ok: boolean;
  /** Preenchido no modo manual: URL que o operador deve abrir. */
  url?: string;
  error?: string;
}

export interface WhatsAppProvider {
  /** `manual` | `twilio` | `zenvia` | `cloud_api` */
  readonly id: string;
  /** Falso quando o envio depende de credenciais ainda não configuradas. */
  isConfigured(): boolean;
  /** Verdadeiro só para providers que entregam a mensagem sozinhos. */
  readonly automatic: boolean;
  prepare(message: WhatsAppMessage): WhatsAppSendResult;
}

/**
 * Provider padrão: prepara o link, o operador envia. Sempre "configurado"
 * porque não depende de credencial nenhuma.
 */
export const manualWhatsAppProvider: WhatsAppProvider = {
  id: "manual",
  automatic: false,
  isConfigured: () => true,
  prepare({ phone, body }) {
    const { valid } = normalizePhone(phone);
    if (!valid) {
      return { ok: false, error: "Telefone inválido ou incompleto." };
    }
    const url = whatsAppUrl(phone, body);
    if (!url) return { ok: false, error: "Não foi possível montar o link do WhatsApp." };
    return { ok: true, url };
  },
};

/**
 * Provider ativo. Quando houver integração automática, a escolha passa a ler
 * a configuração do workspace (como o Pushcut faz em
 * `features/notifications/pushcut.ts`, com as credenciais cifradas).
 */
export function getWhatsAppProvider(): WhatsAppProvider {
  return manualWhatsAppProvider;
}
