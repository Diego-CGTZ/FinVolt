/**
 * RecurringTransactionDetector — Motor de Inteligencia para Detección de Transacciones Recurrentes (US-043)
 *
 * Analiza el historial de transacciones financieras para identificar automáticamente:
 * - Salarios / Nóminas (SALARY)
 * - Rentas / Alquileres (RENT)
 * - Suscripciones digitales y membresías (SUBSCRIPTION)
 * - Préstamos, hipotecas y créditos (LOAN)
 * - Servicios públicos / Utilities (UTILITY)
 * - Otros patrones periódicos (OTHER)
 *
 * Almacena periodicidad (semanal, catorcenal, quincenal, mensual, etc.) y calcula
 * un índice de confianza matemático (0 - 100) basado en varianza de intervalos,
 * consistencia de importes y heurísticas semánticas.
 */

import type { Transaction } from '../../models/Transaction';
import type {
  RecurringPatternType,
  RecurringPeriodicity,
  RecurringTransaction,
} from '../../models/RecurringTransaction';

export interface RecurringDetectorOptions {
  /** Mínimo de transacciones repetidas requeridas para formar un patrón (por defecto: 2) */
  minOccurrences?: number;
  /** Tolerancia en días para desfases de calendario o días inhábiles (por defecto: 3) */
  toleranceDays?: number;
  /** Umbral mínimo de confianza para emitir un patrón recurrente (por defecto: 40) */
  minConfidenceThreshold?: number;
}

export class RecurringTransactionDetector {
  private readonly defaultOptions: Required<RecurringDetectorOptions> = {
    minOccurrences: 2,
    toleranceDays: 3,
    minConfidenceThreshold: 40,
  };

  /**
   * Detecta todas las transacciones recurrentes en el conjunto dado.
   */
  public detect(
    transactions: Transaction[],
    userId?: string,
    options?: RecurringDetectorOptions,
  ): RecurringTransaction[] {
    if (!transactions || transactions.length === 0) {
      return [];
    }

    const opts = { ...this.defaultOptions, ...options };
    const effectiveUserId = userId || transactions[0]?.userId || 'anonymous';

    // 1. Agrupar transacciones por tipo contable, moneda e identidad (comercio o concepto)
    const groups = this.groupTransactions(transactions);

    const recurringList: RecurringTransaction[] = [];

    // 2. Analizar cada grupo
    for (const group of groups) {
      if (group.transactions.length < opts.minOccurrences) {
        continue;
      }

      // Ordenar cronológicamente (más antigua primero)
      const sorted = [...group.transactions].sort(
        (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
      );

      // Analizar regularidad temporal
      const timingAnalysis = this.analyzeTiming(sorted, opts.toleranceDays);
      if (!timingAnalysis.isPeriodic) {
        continue;
      }

      // Analizar montos
      const amountAnalysis = this.analyzeAmounts(sorted);

      // Determinar tipo de patrón semántico
      const patternType = this.classifyPatternType(sorted, timingAnalysis.periodicity);

      // Calcular puntuación de confianza (0 - 100)
      const confidenceScore = this.calculateConfidenceScore({
        timingAnalysis,
        amountAnalysis,
        patternType,
        occurrenceCount: sorted.length,
        hasKnownKeywords: this.hasKnownKeywords(sorted, patternType),
      });

      if (confidenceScore < opts.minConfidenceThreshold) {
        continue;
      }

      const firstTx = sorted[0];
      const lastTx = sorted[sorted.length - 1];

      // Calcular próxima ocurrencia esperada
      const nextExpected = this.calculateNextExpectedOccurrence(
        new Date(lastTx.occurredAt),
        timingAnalysis.periodicity,
        timingAnalysis.averageIntervalDays,
      );

      const representativeMerchant = lastTx.merchant || lastTx.merchantRaw || null;
      const representativeDesc = lastTx.description || null;
      const readableName = this.buildReadableName(
        patternType,
        representativeMerchant,
        representativeDesc,
        timingAnalysis.periodicity,
      );

      const recurringItem: RecurringTransaction = {
        id: this.generateDeterministicId(effectiveUserId, group.key, timingAnalysis.periodicity),
        userId: effectiveUserId,
        accountId: lastTx.accountId || null,
        name: readableName,
        patternType,
        transactionType: lastTx.type,
        merchant: representativeMerchant,
        merchantRaw: lastTx.merchantRaw || null,
        description: representativeDesc,
        periodicity: timingAnalysis.periodicity,
        intervalDays: Math.round(timingAnalysis.averageIntervalDays),
        toleranceDays: opts.toleranceDays,
        averageAmountMinor: amountAnalysis.averageAmountMinor,
        lastAmountMinor: lastTx.amountMinor,
        currency: lastTx.currency,
        isVariableAmount: amountAnalysis.isVariable,
        confidenceScore,
        firstOccurrence: new Date(firstTx.occurredAt),
        lastOccurrence: new Date(lastTx.occurredAt),
        nextExpectedOccurrence: nextExpected,
        occurrenceCount: sorted.length,
        transactionIds: sorted.map((t) => t.id),
        status: 'DETECTED',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      recurringList.push(recurringItem);
    }

    // Ordenar de mayor a menor confianza
    return recurringList.sort((a, b) => b.confidenceScore - a.confidenceScore);
  }

  /**
   * Agrupa transacciones por comercio normalizado o descripción limpia.
   */
  private groupTransactions(transactions: Transaction[]): {
    key: string;
    transactions: Transaction[];
  }[] {
    const map = new Map<string, Transaction[]>();

    for (const tx of transactions) {
      // Ignorar transferencias devueltas o duplicadas descartadas si están marcadas
      if (tx.status === 'REJECTED' || tx.status === 'DUPLICATE') {
        continue;
      }

      const normIdentity = this.extractNormalizedIdentity(tx);
      const groupKey = `${tx.type}:${tx.currency}:${normIdentity}`;

      const existing = map.get(groupKey);
      if (existing) {
        existing.push(tx);
      } else {
        map.set(groupKey, [tx]);
      }
    }

    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      transactions: items,
    }));
  }

  /**
   * Extrae una identidad canónica limpia para agrupar movimientos de la misma fuente.
   */
  private extractNormalizedIdentity(tx: Transaction): string {
    const raw = tx.merchant || tx.merchantRaw || tx.description || 'unknown';
    let clean = raw.toLowerCase().trim();

    // Eliminar acentos
    clean = clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Eliminar referencias a fechas dinámicas comunes (ej. "ENE 2026", "15/01/26", "2026-01-15")
    clean = clean.replace(/\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/g, '');
    clean = clean.replace(/\b\d{4}[/-]\d{1,2}[/-]\d{1,2}\b/g, '');
    clean = clean.replace(/\b(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*(\s+\d{2,4})?\b/g, '');

    // Eliminar números de autorización, folios o series de dígitos de más de 4 caracteres
    clean = clean.replace(/\b\d{5,}\b/g, '');

    // Eliminar símbolos innecesarios
    clean = clean.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // Normalizaciones semánticas directas para marcas conocidas
    if (/netflix/i.test(clean)) return 'brand:netflix';
    if (/spotify/i.test(clean)) return 'brand:spotify';
    if (/disney/i.test(clean)) return 'brand:disney';
    if (/hbo|max/i.test(clean) && !/climax|bimax/i.test(clean)) return 'brand:max';
    if (/prime|amazon\s*prime/i.test(clean)) return 'brand:amazon_prime';
    if (/apple(\.com)?|apple\s*services|itunes|icloud/i.test(clean)) return 'brand:apple';
    if (/google(\s*play|\s*one|\s*storage|\s*youtube)?/i.test(clean)) return 'brand:google';
    if (/youtube/i.test(clean)) return 'brand:youtube';
    if (/cfe|comision\s*federal/i.test(clean)) return 'brand:cfe';
    if (/telmex|infinitum/i.test(clean)) return 'brand:telmex';
    if (/totalplay/i.test(clean)) return 'brand:totalplay';
    if (/izzi/i.test(clean)) return 'brand:izzi';
    if (/telcel/i.test(clean)) return 'brand:telcel';
    if (/at&t|att/i.test(clean)) return 'brand:att';

    // Nómina / Sueldos
    if (/nomina|sueldo|salario|payroll|dispersion/i.test(clean)) {
      return `salary:${clean.replace(/nomina|sueldo|salario|payroll|dispersion/g, '').trim() || 'general'}`;
    }

    // Rentas
    if (/renta|alquiler|arrendamiento|depto|departamento/i.test(clean)) {
      return `rent:${clean.replace(/renta|alquiler|arrendamiento/g, '').trim() || 'general'}`;
    }

    // Préstamos
    if (/prestamo|credito|hipoteca|infonavit|fonacot/i.test(clean)) {
      return `loan:${clean.replace(/prestamo|credito|hipoteca|pago/g, '').trim() || 'general'}`;
    }

    return clean || 'unnamed';
  }

  /**
   * Analiza los deltas temporales entre transacciones para deducir periodicidad y regularidad.
   */
  private analyzeTiming(
    sorted: Transaction[],
    toleranceDays: number,
  ): {
    isPeriodic: boolean;
    periodicity: RecurringPeriodicity;
    averageIntervalDays: number;
    stdDevDays: number;
  } {
    if (sorted.length < 2) {
      return {
        isPeriodic: false,
        periodicity: 'CUSTOM',
        averageIntervalDays: 0,
        stdDevDays: 0,
      };
    }

    const deltas: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1].occurredAt).getTime();
      const curr = new Date(sorted[i].occurredAt).getTime();
      const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
      deltas.push(diffDays);
    }

    const averageIntervalDays = deltas.reduce((acc, d) => acc + d, 0) / deltas.length;

    // Desviación estándar
    const variance =
      deltas.reduce((acc, d) => acc + Math.pow(d - averageIntervalDays, 2), 0) / deltas.length;
    const stdDevDays = Math.sqrt(variance);

    // Revisar si calza con Quincenas (ej. día 15 y día último, o cada ~15 días)
    const isSemimonthlyCalendar = this.checkSemimonthlyCalendar(sorted);

    // Clasificación de periodicidad basada en averageIntervalDays y días calendario
    let periodicity: RecurringPeriodicity = 'CUSTOM';
    let isPeriodic = false;

    if (averageIntervalDays >= 5 && averageIntervalDays <= 9 && stdDevDays <= toleranceDays + 1) {
      periodicity = 'WEEKLY';
      isPeriodic = true;
    } else if (
      averageIntervalDays >= 12 &&
      averageIntervalDays <= 16 &&
      stdDevDays <= toleranceDays + 1.5
    ) {
      // Diferenciar catorcenal estricto (~14 días) vs quincenal (~15 días o calendario 15/30)
      if (isSemimonthlyCalendar || (averageIntervalDays >= 14.5 && averageIntervalDays <= 16)) {
        periodicity = 'SEMIMONTHLY';
      } else {
        periodicity = 'BIWEEKLY';
      }
      isPeriodic = true;
    } else if (isSemimonthlyCalendar) {
      periodicity = 'SEMIMONTHLY';
      isPeriodic = true;
    } else if (
      averageIntervalDays >= 25 &&
      averageIntervalDays <= 35 &&
      stdDevDays <= toleranceDays + 3
    ) {
      periodicity = 'MONTHLY';
      isPeriodic = true;
    } else if (
      averageIntervalDays >= 55 &&
      averageIntervalDays <= 65 &&
      stdDevDays <= toleranceDays + 4
    ) {
      periodicity = 'BIMONTHLY';
      isPeriodic = true;
    } else if (
      averageIntervalDays >= 80 &&
      averageIntervalDays <= 100 &&
      stdDevDays <= toleranceDays + 5
    ) {
      periodicity = 'QUARTERLY';
      isPeriodic = true;
    } else if (
      averageIntervalDays >= 345 &&
      averageIntervalDays <= 385 &&
      stdDevDays <= toleranceDays + 10
    ) {
      periodicity = 'ANNUAL';
      isPeriodic = true;
    } else if (stdDevDays <= toleranceDays) {
      // Intervalo consistente personalizado
      periodicity = 'CUSTOM';
      isPeriodic = true;
    }

    return {
      isPeriodic,
      periodicity,
      averageIntervalDays,
      stdDevDays,
    };
  }

  /**
   * Verifica si las fechas ocurren típicamente alrededor del día 15 y del día de fin de mes (28-31 o 1-2).
   */
  private checkSemimonthlyCalendar(sorted: Transaction[]): boolean {
    let midMonthMatches = 0;
    let endMonthMatches = 0;

    for (const tx of sorted) {
      const d = new Date(tx.occurredAt).getUTCDate();
      if (d >= 13 && d <= 17) {
        midMonthMatches++;
      } else if (d >= 27 || d <= 3) {
        endMonthMatches++;
      }
    }

    // Si tiene ocurrencias tanto a mitad de mes como a fin de mes
    return midMonthMatches >= 1 && endMonthMatches >= 1 && sorted.length >= 2;
  }

  /**
   * Analiza la variación y promedios de los montos de la serie.
   */
  private analyzeAmounts(sorted: Transaction[]): {
    averageAmountMinor: number;
    isVariable: boolean;
    amountStdDevPercent: number;
  } {
    const amounts = sorted.map((t) => t.amountMinor);
    const sum = amounts.reduce((a, b) => a + b, 0);
    const avg = sum / amounts.length;

    const variance =
      amounts.reduce((acc, a) => acc + Math.pow(a - avg, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);
    const stdDevPercent = avg > 0 ? (stdDev / avg) * 100 : 0;

    // Si la variación porcentual es menor al 3%, se considera monto fijo no variable
    const isVariable = stdDevPercent > 3;

    return {
      averageAmountMinor: Math.round(avg),
      isVariable,
      amountStdDevPercent: Math.round(stdDevPercent * 10) / 10,
    };
  }

  /**
   * Clasifica el tipo de patrón financiero (`SALARY`, `RENT`, `SUBSCRIPTION`, `LOAN`, `UTILITY`, `OTHER`).
   */
  private classifyPatternType(
    sorted: Transaction[],
    periodicity: RecurringPeriodicity,
  ): RecurringPatternType {
    const representative = sorted[sorted.length - 1];
    const text = `${representative.merchant || ''} ${representative.merchantRaw || ''} ${
      representative.description || ''
    }`.toLowerCase();

    // 1. SALARY: Flujo de ingreso recurrente (nómina, sueldo, honorarios)
    if (representative.type === 'INCOME') {
      if (
        /nomina|sueldo|salario|payroll|dispersion|honorarios|quincena|pago de sueldo/i.test(text)
      ) {
        return 'SALARY';
      }
      if (
        periodicity === 'SEMIMONTHLY' ||
        periodicity === 'BIWEEKLY' ||
        periodicity === 'MONTHLY' ||
        periodicity === 'WEEKLY'
      ) {
        return 'SALARY';
      }
    }

    // 2. RENT: Renta / Alquiler
    if (
      /renta|alquiler|arrendamiento|depto|departamento|arrendador|inmobiliaria|pago renta/i.test(
        text,
      )
    ) {
      return 'RENT';
    }

    // 3. SUBSCRIPTION: Suscripciones digitales, streaming, membresías
    if (
      /netflix|spotify|disney|hbo|max|prime video|amazon prime|apple|itunes|icloud|google one|youtube|gym|smart fit|chatgpt|openai|github|playstation|xbox|nintendo|duolingo|crunchyroll|adobe/i.test(
        text,
      ) ||
      /suscripcion|subscription|membresia|mensualidad/i.test(text)
    ) {
      return 'SUBSCRIPTION';
    }

    // 4. LOAN: Préstamos, hipotecas, pagos de créditos
    if (
      /prestamo|credito|hipoteca|infonavit|fonacot|pago credito|amortizacion|auto credito|financiera|pago minimo|credito personal/i.test(
        text,
      )
    ) {
      return 'LOAN';
    }

    // 5. UTILITY: Servicios públicos y esenciales
    if (
      /cfe|luz|agua|telmex|infinitum|totalplay|izzi|megacable|telcel|at&t|att|movistar|naturgy|gas natural|siapa|sacmex/i.test(
        text,
      )
    ) {
      return 'UTILITY';
    }

    return 'OTHER';
  }

  /**
   * Comprueba si el texto contiene palabras clave financieras conocidas para bonificar confianza.
   */
  private hasKnownKeywords(sorted: Transaction[], patternType: RecurringPatternType): boolean {
    if (patternType !== 'OTHER') return true;

    const rep = sorted[sorted.length - 1];
    const text = `${rep.merchant || ''} ${rep.merchantRaw || ''} ${
      rep.description || ''
    }`.toLowerCase();

    return /recurrente|periodico|automatico|cargo automatico|domiciliado|plan/i.test(text);
  }

  /**
   * Calcula la puntuación de confianza (0 - 100).
   */
  private calculateConfidenceScore(params: {
    timingAnalysis: {
      averageIntervalDays: number;
      stdDevDays: number;
      periodicity: RecurringPeriodicity;
    };
    amountAnalysis: {
      averageAmountMinor: number;
      isVariable: boolean;
      amountStdDevPercent: number;
    };
    patternType: RecurringPatternType;
    occurrenceCount: number;
    hasKnownKeywords: boolean;
  }): number {
    let score = 40; // Base por periodicidad detectada

    // 1. Regularidad temporal (hasta +25)
    const stdDev = params.timingAnalysis.stdDevDays;
    if (stdDev <= 1.2) {
      score += 25;
    } else if (stdDev <= 2.5) {
      score += 18;
    } else if (stdDev <= 4) {
      score += 10;
    } else {
      score += 5;
    }

    // 2. Consistencia de montos (hasta +20)
    const amountDev = params.amountAnalysis.amountStdDevPercent;
    if (amountDev === 0) {
      score += 20; // Monto exactamente idéntico
    } else if (amountDev <= 2) {
      score += 16;
    } else if (amountDev <= 5) {
      score += 12;
    } else if (params.amountAnalysis.isVariable && params.patternType === 'UTILITY') {
      score += 10; // Utilities varían naturalmente pero son confiables
    } else if (amountDev <= 15) {
      score += 5;
    }

    // 3. Semántica y coincidencia con patrones reconocidos (hasta +15)
    if (params.patternType !== 'OTHER') {
      score += 15;
    } else if (params.hasKnownKeywords) {
      score += 8;
    }

    // 4. Historial y profundidad de ocurrencias (hasta +15)
    if (params.occurrenceCount >= 5) {
      score += 15;
    } else if (params.occurrenceCount >= 4) {
      score += 10;
    } else if (params.occurrenceCount >= 3) {
      score += 6;
    }

    // Acotar entre 0 y 100
    return Math.min(100, Math.max(0, Math.round(score)));
  }

  /**
   * Proyecta la fecha estimada de la próxima ocurrencia.
   */
  private calculateNextExpectedOccurrence(
    lastDate: Date,
    periodicity: RecurringPeriodicity,
    averageIntervalDays: number,
  ): Date {
    const next = new Date(lastDate.getTime());

    switch (periodicity) {
      case 'WEEKLY':
        next.setDate(next.getDate() + 7);
        break;
      case 'BIWEEKLY':
        next.setDate(next.getDate() + 14);
        break;
      case 'SEMIMONTHLY': {
        const currentDay = next.getDate();
        if (currentDay >= 12 && currentDay <= 18) {
          // Si fue a mitad de mes, la próxima es el último día del mismo mes
          const lastDayOfMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
          next.setDate(lastDayOfMonth);
        } else {
          // Si fue a fin de mes, la próxima es el día 15 del mes siguiente
          next.setMonth(next.getMonth() + 1);
          next.setDate(15);
        }
        break;
      }
      case 'MONTHLY':
        next.setMonth(next.getMonth() + 1);
        break;
      case 'BIMONTHLY':
        next.setMonth(next.getMonth() + 2);
        break;
      case 'QUARTERLY':
        next.setMonth(next.getMonth() + 3);
        break;
      case 'ANNUAL':
        next.setFullYear(next.getFullYear() + 1);
        break;
      case 'CUSTOM':
      default:
        next.setDate(next.getDate() + Math.max(1, Math.round(averageIntervalDays)));
        break;
    }

    return next;
  }

  /**
   * Construye un título legible para la recurrencia sin usar emojis.
   */
  private buildReadableName(
    patternType: RecurringPatternType,
    merchant: string | null,
    desc: string | null,
    periodicity: RecurringPeriodicity,
  ): string {
    const periodicityLabels: Record<RecurringPeriodicity, string> = {
      WEEKLY: 'Semanal',
      BIWEEKLY: 'Catorcenal',
      SEMIMONTHLY: 'Quincenal',
      MONTHLY: 'Mensual',
      BIMONTHLY: 'Bimestral',
      QUARTERLY: 'Trimestral',
      ANNUAL: 'Anual',
      CUSTOM: 'Periódico',
    };

    const periodStr = periodicityLabels[periodicity] || 'Periódico';
    const cleanMerchant = merchant ? merchant.trim() : null;

    switch (patternType) {
      case 'SALARY':
        return cleanMerchant ? `Nómina (${cleanMerchant})` : `Salario ${periodStr}`;
      case 'RENT':
        return cleanMerchant ? `Renta - ${cleanMerchant}` : `Renta ${periodStr}`;
      case 'SUBSCRIPTION':
        return cleanMerchant ? `Suscripción ${cleanMerchant}` : `Suscripción ${periodStr}`;
      case 'LOAN':
        return cleanMerchant ? `Crédito - ${cleanMerchant}` : `Pago de Préstamo (${periodStr})`;
      case 'UTILITY':
        return cleanMerchant ? `Servicio ${cleanMerchant}` : `Servicio Público (${periodStr})`;
      case 'OTHER':
      default:
        if (cleanMerchant) return `${cleanMerchant} (${periodStr})`;
        if (desc) return `${desc.slice(0, 30)} (${periodStr})`;
        return `Operación Recurrente (${periodStr})`;
    }
  }

  /**
   * Genera un identificador determinístico para evitar duplicar registros del mismo patrón.
   */
  private generateDeterministicId(
    userId: string,
    groupKey: string,
    periodicity: string,
  ): string {
    const raw = `${userId}:${groupKey}:${periodicity}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash << 5) - hash + raw.charCodeAt(i);
      hash |= 0;
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    return `rec_${hex}_${Date.now().toString(36).slice(-4)}`;
  }
}

export const defaultRecurringTransactionDetector = new RecurringTransactionDetector();
