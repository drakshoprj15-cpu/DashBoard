/**
 * Limites da central de recuperação.
 *
 * Vive fora de `actions.ts` porque um módulo `"use server"` só pode exportar
 * funções assíncronas — exportar uma constante de lá faz o Next tratar o
 * ficheiro inteiro como sem exports.
 */

/** Teto de segurança para qualquer operação em massa vinda da UI. */
export const MAX_BULK_ORDERS = 200;
