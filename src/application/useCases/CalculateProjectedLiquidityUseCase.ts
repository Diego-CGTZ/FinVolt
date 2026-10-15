/**
 * CalculateProjectedLiquidityUseCase — Caso de Uso para Liquidez Proyectada (US-045)
 *
 * Orquesta el cálculo de liquidez futura considerando:
 * - Liquid Assets (Cuentas líquidas: bancos, efectivo, etc.)
 * - Expected Income (Obligaciones futuras de ingreso en el horizonte)
 * - Credit Obligations (Pasivos de tarjetas de crédito)
 * - Committed Expenses (Gastos comprometidos fijos en el horizonte)
 *
 * Soporta ejecución directa en memoria o con resolución vía repositorios.
 */

import type { Account } from '../../domain/models/Account';
import type { Transaction } from '../../domain/models/Transaction';
import type { FutureObligation } from '../../domain/models/FutureObligation';
import type {
  ProjectedLiquidityConfig,
  ProjectedLiquidityResult,
} from '../../domain/models/ProjectedLiquidity';
import { ProjectedLiquidityCalculator } from '../../domain/services/liquidity/ProjectedLiquidityCalculator';
import type { IFutureObligationRepository } from '../../domain/repositories/IFutureObligationRepository';

export interface CalculateProjectedLiquidityInput {
  userId?: string;
  accounts: Account[];
  transactions?: Transaction[];
  obligations?: FutureObligation[];
  config?: Partial<ProjectedLiquidityConfig>;
}

export class CalculateProjectedLiquidityUseCase {
  constructor(
    private readonly obligationRepo?: IFutureObligationRepository,
  ) {}

  /**
   * Ejecuta el cálculo determinístico de liquidez proyectada
   */
  public async execute(
    input: CalculateProjectedLiquidityInput,
  ): Promise<ProjectedLiquidityResult> {
    const {
      userId,
      accounts,
      transactions = [],
      config = {},
    } = input;

    let obligations = input.obligations;

    // Si no se pasaron obligaciones en memoria y hay repositorio disponible, cargarlas
    if (!obligations && this.obligationRepo && userId) {
      const userObligations = await this.obligationRepo.findByUserId(userId);
      obligations = userObligations.filter((o) => o.status === 'ACTIVE');
    } else if (!obligations) {
      obligations = [];
    }


    const resolvedConfig: ProjectedLiquidityConfig = {
      startDate: config.startDate || new Date(),
      horizonDays: config.horizonDays && config.horizonDays > 0 ? config.horizonDays : 30,
      includeEstimatedExpenses: config.includeEstimatedExpenses ?? true,
      currency: config.currency || 'MXN',
    };

    return ProjectedLiquidityCalculator.calculate({
      accounts,
      transactions,
      obligations,
      config: resolvedConfig,
    });
  }

  /**
   * Versión sincrónica para uso directo en UI/Hooks cuando todos los datos ya están en memoria
   */
  public executeSync(
    input: Omit<CalculateProjectedLiquidityInput, 'userId'> & { obligations: FutureObligation[] },
  ): ProjectedLiquidityResult {
    const resolvedConfig: ProjectedLiquidityConfig = {
      startDate: input.config?.startDate || new Date(),
      horizonDays: input.config?.horizonDays && input.config.horizonDays > 0 ? input.config.horizonDays : 30,
      includeEstimatedExpenses: input.config?.includeEstimatedExpenses ?? true,
      currency: input.config?.currency || 'MXN',
    };

    return ProjectedLiquidityCalculator.calculate({
      accounts: input.accounts,
      transactions: input.transactions || [],
      obligations: input.obligations,
      config: resolvedConfig,
    });
  }
}
