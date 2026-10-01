/**
 * US-021: Financial Content Detector
 *
 * Analiza el contenido textual de una notificación o evento crudo para
 * determinar si corresponde a un movimiento financiero transaccional real
 * (compra, cargo, abono, retiro, transferencia) o a contenido no financiero
 * (códigos OTP, publicidad, avisos informativos).
 */

import type { TransactionType } from '../../models/Transaction';

export type TransactionalIntent = TransactionType | 'NON_TRANSACTIONAL';

export interface FinancialDetectionResult {
  isFinancial: boolean;
  isTransactional: boolean;
  intent: TransactionalIntent;
  extractedAmount: number | null;
  currency: string;
  confidence: number;
  reason?: string;
}

// Patrones de exclusión: mensajes informativos o de seguridad que NO son transacciones
const NON_TRANSACTIONAL_PATTERNS = [
  /c[oó]digo de seguridad/i,
  /clave din[aá]mica/i,
  /token m[oó]vil/i,
  /c[oó]digo de verificaci[oó]n/i,
  /otp/i,
  /inici[oó] sesi[oó]n/i,
  /nuevo inicio de sesi[oó]n/i,
  /cambio de contrase[ñn]a/i,
  /contrato/i,
  /t[eé]rminos y condiciones/i,
  /aprovecha/i,
  /promoci[oó]n/i,
  /invita a tus amigos/i,
  /solicita tu cr[eé]dito/i,
  /preaprobado/i,
  /estado de cuenta disponible/i,
  /consulta tu saldo/i,
];

// Palabras clave de gastos
const EXPENSE_PATTERNS = [
  /compra\b/i,
  /cargo\b/i,
  /retiro\b/i,
  /pago con tarjeta\b/i,
  /pago realizado\b/i,
  /pago de servicio\b/i,
  /transferencia enviada\b/i,
  /enviaste\b/i,
  /pagaste\b/i,
  /consumo\b/i,
  /disposici[oó]n\b/i,
];

// Palabras clave de ingresos
const INCOME_PATTERNS = [
  /dep[oó]sito\b/i,
  /abono\b/i,
  /n[oó]mina\b/i,
  /transferencia recibida\b/i,
  /recibiste\b/i,
  /te transfiri[oó]\b/i,
  /ingreso\b/i,
  /devoluci[oó]n\b/i,
  /reembolso\b/i,
];

// Palabras clave de transferencias/traspasos
const TRANSFER_PATTERNS = [
  /traspaso entre cuentas\b/i,
  /transferencia a cuenta propia\b/i,
  /traspaso propio\b/i,
  /spei\b/i,
];

export class FinancialContentDetector {
  /**
   * Analiza el texto para extraer intención financiera, monto estimado y clasificar.
   */
  public static detect(input: { title?: string; text?: string }): FinancialDetectionResult {
    const title = input.title || '';
    const text = input.text || '';
    const fullText = `${title} ${text}`.trim();

    if (!fullText) {
      return {
        isFinancial: false,
        isTransactional: false,
        intent: 'NON_TRANSACTIONAL',
        extractedAmount: null,
        currency: 'MXN',
        confidence: 0,
        reason: 'Contenido vacío',
      };
    }

    // 1. Verificar exclusiones de no-transaccionalidad (seguridad, OTP, promociones)
    for (const pattern of NON_TRANSACTIONAL_PATTERNS) {
      if (pattern.test(fullText)) {
        return {
          isFinancial: true,
          isTransactional: false,
          intent: 'NON_TRANSACTIONAL',
          extractedAmount: null,
          currency: 'MXN',
          confidence: 90,
          reason: 'Aviso de seguridad, código de acceso o promoción no transaccional',
        };
      }
    }

    // 2. Extracción tentativa de monto
    const extractedAmount = this.extractAmount(fullText);
    const currency = /USD|d[oó]lares/i.test(fullText) ? 'USD' : 'MXN';

    // 3. Determinar intención transaccional
    let intent: TransactionalIntent = 'NON_TRANSACTIONAL';
    let isTransactional = false;
    let confidence = 50;

    if (EXPENSE_PATTERNS.some((p) => p.test(fullText))) {
      intent = 'EXPENSE';
      isTransactional = true;
      confidence = extractedAmount !== null ? 92 : 75;
    } else if (INCOME_PATTERNS.some((p) => p.test(fullText))) {
      intent = 'INCOME';
      isTransactional = true;
      confidence = extractedAmount !== null ? 90 : 70;
    } else if (TRANSFER_PATTERNS.some((p) => p.test(fullText))) {
      intent = 'TRANSFER';
      isTransactional = true;
      confidence = extractedAmount !== null ? 85 : 65;
    } else if (extractedAmount !== null) {
      // Si tiene monto pero sin verbo explícito, se presume gasto por defecto en notificaciones bancarias
      intent = 'EXPENSE';
      isTransactional = true;
      confidence = 65;
    }

    const isFinancial = isTransactional || extractedAmount !== null;

    return {
      isFinancial,
      isTransactional,
      intent,
      extractedAmount,
      currency,
      confidence,
      reason: isTransactional
        ? `Detectado movimiento de tipo ${intent}`
        : 'No se detectó un movimiento monetario transaccional',
    };
  }

  /**
   * Extrae el valor numérico de un monto encontrado en el texto.
   */
  public static extractAmount(text: string): number | null {
    // Buscar patrones específicos con signo de pesos o moneda
    const patterns = [
      /\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/,
      /(?:por|monto|de)\s*\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2}))/i,
      /([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2}))\s*(?:MXN|pesos)/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const cleaned = match[1].replace(/,/g, '');
        const val = parseFloat(cleaned);
        if (!isNaN(val) && val > 0) {
          return Math.round(val * 100) / 100;
        }
      }
    }

    return null;
  }
}
