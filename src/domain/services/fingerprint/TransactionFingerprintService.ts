/**
 * US-025: Servicio de Fingerprint Determinístico
 *
 * Genera una identidad reproducible y estable para detectar posibles duplicados
 * entre transacciones y candidatos originados en diferentes fuentes (notificaciones,
 * estados de cuenta, correos, registros manuales).
 *
 * Criterios de Aceptación:
 * - El fingerprint usa: account, amount, currency, date, merchant y type.
 * - El mismo evento produce un fingerprint idéntico y estable en el tiempo.
 * - Normaliza variaciones tipográficas y de formato para garantizar congruencia cross-platform.
 */

import type { Transaction, TransactionType, CreateTransactionInput } from '../../models/Transaction';
import type { TransactionCandidate, AccountHint } from '../../models/TransactionCandidate';
import { sha256Hex } from './Sha256';

export interface FingerprintInput {
  /**
   * Identificador de la cuenta o indicio de cuenta (últimos 4 dígitos / banco).
   * Si no está asignada todavía (como en un candidato recién detectado),
   * se utiliza 'unassigned' o el hint normalizado.
   */
  account?: string | AccountHint | null;

  /**
   * Monto monetario decimal (ej: 149.50) o en unidades menores (centavos, ej: 14950).
   */
  amount?: number;

  /**
   * Monto explícito en unidades menores (centavos) para máxima exactitud contable.
   */
  amountMinor?: number;

  /**
   * Código de moneda ISO 4217 (ej: 'MXN', 'USD'). Por defecto 'MXN'.
   */
  currency?: string | null;

  /**
   * Fecha de ocurrencia del movimiento. Se normaliza a formato de fecha canónico 'YYYY-MM-DD'.
   */
  date: Date | string;

  /**
   * Nombre del comercio (puede ser raw o normalizado). Se estandariza en minúsculas y sin espacios superfluos.
   */
  merchant?: string | null;

  /**
   * Nombre original/crudo del comercio capturado en la fuente si está disponible.
   */
  merchantRaw?: string | null;

  /**
   * Tipo de movimiento financiero ('EXPENSE', 'INCOME', 'TRANSFER').
   */
  type: TransactionType | string;
}

export interface FingerprintOptions {
  /**
   * Sobrescribe el valor de la cuenta si se desea agrupar por cuenta específica.
   */
  accountOverride?: string;

  /**
   * Si es true, omite la normalización estricta del comercio y usa el string exacto.
   */
  strictMerchantMatch?: boolean;
}

export class TransactionFingerprintService {
  /**
   * Normaliza el identificador de cuenta a una representación canónica y predecible.
   */
  public static normalizeAccount(account?: string | AccountHint | null): string {
    if (!account) {
      return 'unassigned';
    }

    if (typeof account === 'string') {
      const trimmed = account.trim().toLowerCase();
      return trimmed.length > 0 ? trimmed : 'unassigned';
    }

    // Si es un objeto AccountHint
    const bank = (account.bankName || 'bank').trim().toLowerCase();
    const last4 = (account.last4Digits || '0000').trim();
    return `${bank}_${last4}`;
  }

  /**
   * Normaliza el monto a unidades menores (centavos enteros).
   */
  public static normalizeAmountMinor(input: { amount?: number; amountMinor?: number }): number {
    if (input.amountMinor !== undefined && input.amountMinor !== null && !isNaN(input.amountMinor)) {
      return Math.round(Math.abs(input.amountMinor));
    }

    if (input.amount !== undefined && input.amount !== null && !isNaN(input.amount)) {
      return Math.round(Math.abs(input.amount) * 100);
    }

    return 0;
  }

  /**
   * Normaliza el código de divisa a mayúsculas ISO 4217 estándar.
   */
  public static normalizeCurrency(currency?: string | null): string {
    if (!currency || !currency.trim()) {
      return 'MXN';
    }
    return currency.trim().toUpperCase();
  }

  /**
   * Normaliza la fecha de ocurrencia a formato canónico 'YYYY-MM-DD'.
   * Garantiza que desfasajes de segundos o zonas horarias no rompan la estabilidad.
   */
  public static normalizeDate(date: Date | string): string {
    if (date instanceof Date) {
      if (isNaN(date.getTime())) {
        return '1970-01-01';
      }
      return date.toISOString().slice(0, 10);
    }

    if (typeof date === 'string') {
      const trimmed = date.trim();
      // Si ya tiene formato YYYY-MM-DD
      const dateMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        return dateMatch[1];
      }
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
      }
    }

    return '1970-01-01';
  }

  /**
   * Normaliza el nombre del comercio para el fingerprint:
   * Colapsa espacios repetidos, remueve espacios en los extremos y convierte a minúsculas.
   */
  public static normalizeMerchant(merchant?: string | null): string {
    if (!merchant || !merchant.trim()) {
      return '';
    }
    return merchant.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Normaliza el tipo de transacción a mayúsculas ('EXPENSE', 'INCOME', 'TRANSFER').
   */
  public static normalizeType(type: TransactionType | string): string {
    if (!type || typeof type !== 'string') {
      return 'EXPENSE';
    }
    const upper = type.trim().toUpperCase();
    if (upper === 'INCOME' || upper === 'TRANSFER' || upper === 'EXPENSE') {
      return upper;
    }
    return 'EXPENSE';
  }

  /**
   * Construye la representación canónica en texto plano previa al hash.
   * Formato: `account|amount_minor|currency|date|merchant|type`
   */
  public static buildCanonicalString(
    input: FingerprintInput,
    options?: FingerprintOptions,
  ): string {
    const account = options?.accountOverride
      ? this.normalizeAccount(options.accountOverride)
      : this.normalizeAccount(input.account);

    const amountMinor = this.normalizeAmountMinor({
      amount: input.amount,
      amountMinor: input.amountMinor,
    });

    const currency = this.normalizeCurrency(input.currency);
    const date = this.normalizeDate(input.date);
    const merchant = options?.strictMerchantMatch
      ? (input.merchant ?? '')
      : this.normalizeMerchant(input.merchant);
    const type = this.normalizeType(input.type);

    return `${account}|${amountMinor}|${currency}|${date}|${merchant}|${type}`;
  }

  /**
   * Calcula el fingerprint SHA-256 determinístico a partir de los datos del evento.
   */
  public static calculate(
    input: FingerprintInput,
    options?: FingerprintOptions,
  ): string {
    const canonical = this.buildCanonicalString(input, options);
    return sha256Hex(canonical);
  }

  /**
   * Calcula el fingerprint directamente a partir de una entidad Transaction (US-008).
   */
  public static fromTransaction(transaction: Transaction): string {
    return this.calculate({
      account: transaction.accountId,
      amountMinor: transaction.amountMinor,
      currency: transaction.currency,
      date: transaction.occurredAt,
      merchant: transaction.merchant || transaction.merchantRaw || '',
      type: transaction.type,
    });
  }

  /**
   * Calcula el fingerprint directamente a partir de un TransactionCandidate (US-023).
   * Permite indicar un accountId de destino si se tiene disponible.
   */
  public static fromCandidate(
    candidate: TransactionCandidate,
    accountOverride?: string,
  ): string {
    const account = accountOverride || candidate.accountHint || 'unassigned';
    return this.calculate({
      account,
      amountMinor: candidate.amountMinor,
      currency: candidate.currency,
      date: candidate.occurredAt,
      merchant: candidate.merchant || candidate.merchantRaw || '',
      type: candidate.type,
    });
  }

  /**
   * Calcula el fingerprint a partir de un DTO de creación de transacción manual.
   */
  public static fromInput(input: CreateTransactionInput): string {
    return this.calculate({
      account: input.accountId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      date: input.occurredAt,
      merchant: input.merchant || input.merchantRaw || '',
      type: input.type,
    });
  }

  /**
   * Determina si dos eventos o transacciones representan la misma identidad determinística.
   */
  public static matches(
    a: FingerprintInput | string,
    b: FingerprintInput | string,
  ): boolean {
    const fpA = typeof a === 'string' ? a : this.calculate(a);
    const fpB = typeof b === 'string' ? b : this.calculate(b);
    return fpA.length === 64 && fpA.toLowerCase() === fpB.toLowerCase();
  }

  /**
   * Valida si un string cumple el formato de un fingerprint SHA-256 (64 caracteres hex).
   */
  public static isValidFingerprint(fingerprint?: string | null): boolean {
    if (!fingerprint || typeof fingerprint !== 'string') {
      return false;
    }
    return /^[a-f0-9]{64}$/i.test(fingerprint.trim());
  }
}
