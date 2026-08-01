/**
 * Mascaramento de dados pessoais sensíveis para exibição/exportação por
 * padrão (CPF/NIF). Mantém só os primeiros 3 e os últimos 2 caracteres
 * visíveis — suficiente para o suporte confirmar o documento com o cliente
 * sem expor o valor completo.
 */
export function maskDocument(document: string | null | undefined): string {
  if (!document) return "—";
  const trimmed = document.trim();
  if (trimmed.length === 0) return "—";
  if (trimmed.length <= 5) return "•".repeat(trimmed.length);

  const visibleStart = trimmed.slice(0, 3);
  const visibleEnd = trimmed.slice(-2);
  const hiddenLength = Math.max(3, trimmed.length - 5);
  return `${visibleStart}${"•".repeat(hiddenLength)}${visibleEnd}`;
}
