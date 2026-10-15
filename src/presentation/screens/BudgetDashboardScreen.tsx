/**
 * BudgetDashboardScreen — Dashboard de Presupuestos (US-048)
 *
 * Muestra visualmente el consumo de presupuestos por categoría y global:
 * - Presupuesto asignado, consumido, restante y porcentaje.
 * - Categorías con desglose detallado e íconos temáticos.
 * - Estados de alerta: En regla (ON_TRACK), Advertencia (WARNING >= 80%), Sobregiro (OVERSPENT).
 * - Selector mensual y métricas de ritmo de gasto.
 * - Modal interactivo de detalle de transacciones por categoría.
 *
 * REGLA ESTRICTA DE UI:
 * Cero emojis en cualquier elemento visual o texto. Uso exclusivo de
 * iconos vectoriales Ionicons y tipografía limpia.
 */

import React, { useMemo, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../application/state/AuthContext';
import { useTransactions } from '../../application/state/TransactionsContext';
import { useCategories } from '../../application/state/CategoriesContext';
import { AsyncStorageBudgetRepository } from '../../infrastructure/database/AsyncStorageBudgetRepository';
import { ManageBudgetsUseCase } from '../../application/useCases/ManageBudgetsUseCase';
import { BudgetConsumptionCalculator } from '../../domain/services/budgets/BudgetConsumptionCalculator';
import type { Budget, BudgetMonthlySummary } from '../../domain/models/Budget';
import type {
  MonthlyBudgetConsumptionSummary,
  CategoryBudgetConsumption,
} from '../../domain/models/BudgetConsumption';
import type { Transaction } from '../../domain/models/Transaction';
import type { Category } from '../../domain/models/Category';

export interface BudgetDashboardScreenProps {
  onBack?: () => void;
  initialMonth?: string;
}

type FilterMode = 'ALL' | 'ALERTS' | 'UNBUDGETED';

export function BudgetDashboardScreen({
  onBack,
  initialMonth,
}: BudgetDashboardScreenProps) {
  const { user } = useAuth();
  const { transactions } = useTransactions();
  const { categories } = useCategories();

  const currentYearMonth = useMemo(() => {
    if (initialMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(initialMonth)) {
      return initialMonth;
    }
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, [initialMonth]);

  const [selectedMonth, setSelectedMonth] = useState<string>(currentYearMonth);
  const [filterMode, setFilterMode] = useState<FilterMode>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<CategoryBudgetConsumption | null>(null);
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const budgetRepo = useMemo(() => new AsyncStorageBudgetRepository(), []);
  const budgetUseCase = useMemo(() => new ManageBudgetsUseCase(budgetRepo), [budgetRepo]);

  const [budgets, setBudgets] = useState<Budget[]>([]);

  const categoriesMap = useMemo(() => {
    const map: Record<string, Category> = {};
    for (const c of categories) {
      map[c.id] = c;
    }
    return map;
  }, [categories]);

  // Cargar o inicializar presupuestos para el mes seleccionado
  useEffect(() => {
    let isMounted = true;
    const uid = user?.id || 'demo-user';

    const loadBudgets = async () => {
      setIsLoading(true);
      try {
        let summary: BudgetMonthlySummary = await budgetUseCase.getBudgetsByMonth(uid, selectedMonth);

        // Si no hay presupuestos en el mes, inicializar presupuestos demo basados en categorías disponibles
        if (summary.budgets.length === 0) {
          const housingCat = categories.find((c) => c.name.toLowerCase().includes('vivienda') || c.name.toLowerCase().includes('casa')) || categories[0];
          const foodCat = categories.find((c) => c.name.toLowerCase().includes('comida') || c.name.toLowerCase().includes('aliment') || c.name.toLowerCase().includes('super')) || categories[1];
          const servicesCat = categories.find((c) => c.name.toLowerCase().includes('servicio') || c.name.toLowerCase().includes('luz') || c.name.toLowerCase().includes('transporte')) || categories[2];

          const demoItems: { catId: string; amountMinor: number; percentage: number; notes: string }[] = [];
          if (housingCat) {
            demoItems.push({ catId: housingCat.id, amountMinor: 800000, percentage: 40.0, notes: 'Renta y Servicios' });
          }
          if (foodCat && (!housingCat || foodCat.id !== housingCat.id)) {
            demoItems.push({ catId: foodCat.id, amountMinor: 600000, percentage: 30.0, notes: 'Supermercado y Despensa' });
          }
          if (servicesCat && (!housingCat || servicesCat.id !== housingCat.id) && (!foodCat || servicesCat.id !== foodCat.id)) {
            demoItems.push({ catId: servicesCat.id, amountMinor: 300000, percentage: 15.0, notes: 'Transporte y Movilidad' });
          }

          for (const item of demoItems) {
            await budgetUseCase.createBudget({
              userId: uid,
              categoryId: item.catId,
              month: selectedMonth,
              amountMinor: item.amountMinor,
              percentage: item.percentage,
              notes: item.notes,
            }).catch(() => {});
          }

          summary = await budgetUseCase.getBudgetsByMonth(uid, selectedMonth);
        }

        if (isMounted) {
          setBudgets(summary.budgets);
        }
      } catch {
        // En caso de error se deja vacío
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadBudgets();

    return () => {
      isMounted = false;
    };
  }, [budgetUseCase, user?.id, selectedMonth, categories]);

  // Cálculo canónico del consumo de presupuesto
  const consumptionSummary: MonthlyBudgetConsumptionSummary = useMemo(() => {
    const uid = user?.id || 'demo-user';
    return BudgetConsumptionCalculator.calculate({
      budgets,
      transactions,
      month: selectedMonth,
      userId: uid,
    });
  }, [budgets, transactions, selectedMonth, user?.id]);

  // Transacciones asociadas a la categoría seleccionada en el modal
  const categoryTransactions: Transaction[] = useMemo(() => {
    if (!selectedCategory) return [];
    const txIdSet = new Set(selectedCategory.transactionIds);
    return transactions.filter((tx) => txIdSet.has(tx.id));
  }, [selectedCategory, transactions]);

  // Navegación de meses
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prevDate = new Date(Date.UTC(y, m - 2, 1));
    const nextStr = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(nextStr);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const nextDate = new Date(Date.UTC(y, m, 1));
    const nextStr = `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(nextStr);
  };

  // Formato legible de mes
  const formattedMonth = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    return `${monthNames[m - 1]} ${y}`;
  }, [selectedMonth]);

  // Categorías filtradas
  const displayedCategories = useMemo(() => {
    if (filterMode === 'ALERTS') {
      return consumptionSummary.categories.filter((c) => c.status === 'WARNING' || c.status === 'OVERSPENT');
    }
    return consumptionSummary.categories;
  }, [consumptionSummary.categories, filterMode]);

  // Transacciones no presupuestadas
  const unbudgetedTransactions = useMemo(() => {
    const budgetedCatIds = new Set(budgets.map((b) => b.categoryId));
    return transactions.filter((tx) => {
      if (tx.type !== 'EXPENSE') return false;
      if (tx.status === 'REJECTED' || tx.status === 'DUPLICATE') return false;
      const txDate = tx.occurredAt instanceof Date ? tx.occurredAt : new Date(tx.occurredAt);
      const y = txDate.getUTCFullYear();
      const m = String(txDate.getUTCMonth() + 1).padStart(2, '0');
      const txMonth = `${y}-${m}`;
      if (txMonth !== selectedMonth) return false;
      return !tx.categoryId || !budgetedCatIds.has(tx.categoryId);
    });
  }, [transactions, budgets, selectedMonth]);

  const handleOpenCategoryDetail = (item: CategoryBudgetConsumption) => {
    setSelectedCategory(item);
    setIsDetailModalVisible(true);
  };

  const isGlobalOverspent = consumptionSummary.totalSpentMinor > consumptionSummary.totalBudgetedMinor;
  const isGlobalWarning = consumptionSummary.overallPercentageUsed >= 80 && !isGlobalOverspent;

  return (
    <View style={styles.screen}>
      {/* Barra superior de navegación */}
      <View style={styles.topBar}>
        {onBack ? (
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="arrow-back" size={22} color="#f8fafc" />
          </TouchableOpacity>
        ) : (
          <View style={styles.backPlaceholder}>
            <Ionicons name="pie-chart" size={22} color="#6366f1" />
          </View>
        )}
        <View style={styles.topTitleContainer}>
          <Text style={styles.topTitle}>Dashboard de Presupuestos</Text>
          <Text style={styles.topSubtitle}>Control de gastos y alertas (US-048)</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Selector de Mes */}
        <View style={styles.monthSelectorCard}>
          <TouchableOpacity
            style={styles.monthNavButton}
            onPress={handlePrevMonth}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={18} color="#94a3b8" />
          </TouchableOpacity>

          <View style={styles.monthDisplay}>
            <Ionicons name="calendar-outline" size={16} color="#6366f1" style={{ marginRight: 6 }} />
            <Text style={styles.monthDisplayText}>{formattedMonth}</Text>
          </View>

          <TouchableOpacity
            style={styles.monthNavButton}
            onPress={handleNextMonth}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* Hero Card: Resumen Global de Consumo */}
        <View
          style={[
            styles.heroCard,
            isGlobalOverspent
              ? styles.heroCardDanger
              : isGlobalWarning
              ? styles.heroCardWarning
              : styles.heroCardNormal,
          ]}
        >
          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.heroSubtext}>Presupuesto Total del Periodo</Text>
              <Text style={styles.heroTitleAmount}>
                ${consumptionSummary.totalBudgeted.toFixed(2)}{' '}
                <Text style={styles.currencySmall}>{consumptionSummary.currency}</Text>
              </Text>
            </View>

            {/* Badge de Estado Global */}
            <View
              style={[
                styles.globalStatusBadge,
                isGlobalOverspent
                  ? styles.badgeDanger
                  : isGlobalWarning
                  ? styles.badgeWarning
                  : styles.badgeSafe,
              ]}
            >
              <Ionicons
                name={
                  isGlobalOverspent
                    ? 'alert-circle'
                    : isGlobalWarning
                    ? 'warning'
                    : 'checkmark-circle'
                }
                size={14}
                color={
                  isGlobalOverspent
                    ? '#f87171'
                    : isGlobalWarning
                    ? '#fbbf24'
                    : '#34d399'
                }
                style={{ marginRight: 4 }}
              />
              <Text
                style={[
                  styles.globalStatusText,
                  isGlobalOverspent
                    ? styles.textDanger
                    : isGlobalWarning
                    ? styles.textWarning
                    : styles.textSafe,
                ]}
              >
                {isGlobalOverspent
                  ? 'Sobregiro'
                  : isGlobalWarning
                  ? 'Precaución'
                  : 'En Regla'}
              </Text>
            </View>
          </View>

          {/* Barra de Progreso Global */}
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressBar,
                  {
                    width: `${Math.min(consumptionSummary.overallPercentageUsed, 100)}%`,
                    backgroundColor: isGlobalOverspent
                      ? '#ef4444'
                      : isGlobalWarning
                      ? '#f59e0b'
                      : '#10b981',
                  },
                ]}
              />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.percentageText}>
                {consumptionSummary.overallPercentageUsed.toFixed(1)}% consumido
              </Text>
              <Text style={styles.remainingPercentageText}>
                {isGlobalOverspent
                  ? `Excedido por $${consumptionSummary.totalOverspent.toFixed(2)}`
                  : `$${consumptionSummary.totalRemaining.toFixed(2)} restante`}
              </Text>
            </View>
          </View>

          {/* Grid de 3 Métricas Clave */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiCol}>
              <Text style={styles.kpiLabel}>Consumido</Text>
              <Text style={[styles.kpiValue, styles.textSpent]}>
                ${consumptionSummary.totalSpent.toFixed(2)}
              </Text>
            </View>

            <View style={styles.kpiColDivider} />

            <View style={styles.kpiCol}>
              <Text style={styles.kpiLabel}>Restante</Text>
              <Text style={[styles.kpiValue, styles.textRemaining]}>
                ${consumptionSummary.totalRemaining.toFixed(2)}
              </Text>
            </View>

            <View style={styles.kpiColDivider} />

            <View style={styles.kpiCol}>
              <Text style={styles.kpiLabel}>Sobregiro</Text>
              <Text
                style={[
                  styles.kpiValue,
                  consumptionSummary.totalOverspent > 0
                    ? styles.textOverspentAlert
                    : styles.textDim,
                ]}
              >
                ${consumptionSummary.totalOverspent.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* Banner de Estado de Alerta */}
        {consumptionSummary.hasOverspentCategories ? (
          <View style={styles.alertBannerDanger}>
            <Ionicons name="alert-circle" size={20} color="#f87171" style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertBannerTitleDanger}>
                {consumptionSummary.overspentCategoriesCount}{' '}
                {consumptionSummary.overspentCategoriesCount === 1
                  ? 'categoría sobregirada'
                  : 'categorías sobregiradas'}
              </Text>
              <Text style={styles.alertBannerDescDanger}>
                Se ha superado el límite en ${consumptionSummary.totalOverspent.toFixed(2)}{' '}
                {consumptionSummary.currency}. Revisa los movimientos asociados.
              </Text>
            </View>
          </View>
        ) : consumptionSummary.warningCategoriesCount > 0 ? (
          <View style={styles.alertBannerWarning}>
            <Ionicons name="warning" size={20} color="#fbbf24" style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertBannerTitleWarning}>
                {consumptionSummary.warningCategoriesCount}{' '}
                {consumptionSummary.warningCategoriesCount === 1
                  ? 'categoría cercana al límite'
                  : 'categorías cercanas al límite'}
              </Text>
              <Text style={styles.alertBannerDescWarning}>
                Consumo superior al 80% del presupuesto mensual asignado.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.alertBannerSafe}>
            <Ionicons name="shield-checkmark" size={20} color="#34d399" style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertBannerTitleSafe}>Presupuesto bajo control</Text>
              <Text style={styles.alertBannerDescSafe}>
                Todas las categorías presupuestadas se encuentran dentro de los márgenes programados.
              </Text>
            </View>
          </View>
        )}

        {/* Barra de Filtros */}
        <View style={styles.filtersRow}>
          <TouchableOpacity
            style={[styles.filterChip, filterMode === 'ALL' && styles.filterChipActive]}
            onPress={() => setFilterMode('ALL')}
          >
            <Text
              style={[
                styles.filterChipText,
                filterMode === 'ALL' && styles.filterChipTextActive,
              ]}
            >
              Todas ({consumptionSummary.categories.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, filterMode === 'ALERTS' && styles.filterChipActive]}
            onPress={() => setFilterMode('ALERTS')}
          >
            <Ionicons
              name="alert-outline"
              size={14}
              color={filterMode === 'ALERTS' ? '#6366f1' : '#94a3b8'}
              style={{ marginRight: 4 }}
            />
            <Text
              style={[
                styles.filterChipText,
                filterMode === 'ALERTS' && styles.filterChipTextActive,
              ]}
            >
              En Alerta ({consumptionSummary.warningCategoriesCount + consumptionSummary.overspentCategoriesCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, filterMode === 'UNBUDGETED' && styles.filterChipActive]}
            onPress={() => setFilterMode('UNBUDGETED')}
          >
            <Text
              style={[
                styles.filterChipText,
                filterMode === 'UNBUDGETED' && styles.filterChipTextActive,
              ]}
            >
              No Asignados (${consumptionSummary.unbudgetedSpent.toFixed(0)})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sección de Categorías Presupuestadas */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#6366f1" />
            <Text style={styles.loadingText}>Calculando consumo...</Text>
          </View>
        ) : filterMode === 'UNBUDGETED' ? (
          /* Vista de Gastos No Presupuestados */
          <View style={styles.unbudgetedSection}>
            <View style={styles.sectionHeader}>
              <Ionicons name="help-buoy-outline" size={18} color="#94a3b8" style={{ marginRight: 6 }} />
              <Text style={styles.sectionTitle}>Gastos Sin Presupuesto Asignado</Text>
            </View>

            {unbudgetedTransactions.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="checkmark-done-circle-outline" size={32} color="#64748b" />
                <Text style={styles.emptyTitle}>Sin gastos no presupuestados</Text>
                <Text style={styles.emptySubtitle}>
                  Todos los gastos de este mes tienen una categoría con presupuesto asignado.
                </Text>
              </View>
            ) : (
              <View style={styles.unbudgetedCard}>
                <View style={styles.unbudgetedHeader}>
                  <Text style={styles.unbudgetedTotalLabel}>Total Gastado sin Asignación:</Text>
                  <Text style={styles.unbudgetedTotalAmount}>
                    ${consumptionSummary.unbudgetedSpent.toFixed(2)}{' '}
                    <Text style={styles.currencySmall}>{consumptionSummary.currency}</Text>
                  </Text>
                </View>

                {unbudgetedTransactions.map((tx) => {
                  const cat = tx.categoryId ? categoriesMap[tx.categoryId] : null;
                  return (
                    <View key={tx.id} style={styles.unbudgetedRow}>
                      <View style={styles.unbudgetedRowLeft}>
                        <Ionicons name="pricetag-outline" size={16} color="#64748b" style={{ marginRight: 8 }} />
                        <View>
                          <Text style={styles.unbudgetedMerchant} numberOfLines={1}>
                            {tx.merchant || tx.description || 'Movimiento'}
                          </Text>
                          <Text style={styles.unbudgetedCategory}>
                            {cat ? cat.name : 'Sin categoría'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.unbudgetedAmount}>
                        ${(tx.amountMinor / 100).toFixed(2)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : displayedCategories.length === 0 ? (
          /* Estado Vacío de Categorías */
          <View style={styles.emptyCard}>
            <Ionicons name="folder-open-outline" size={36} color="#64748b" />
            <Text style={styles.emptyTitle}>
              {filterMode === 'ALERTS'
                ? 'No hay categorías en alerta'
                : 'No hay presupuestos asignados'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {filterMode === 'ALERTS'
                ? 'Todos los consumos están dentro de los márgenes seguros.'
                : 'Asigna presupuestos por categoría para monitorear tu ritmo de gasto.'}
            </Text>
          </View>
        ) : (
          /* Lista de Tarjetas de Categoría */
          <View style={styles.categoryList}>
            {displayedCategories.map((item) => {
              const cat = categoriesMap[item.categoryId];
              const catName = item.categoryName || cat?.name || 'Categoría';
              const catIcon = (cat?.icon as any) || 'pricetag';
              const catColor = cat?.color || '#38bdf8';

              const isOverspent = item.status === 'OVERSPENT';
              const isWarning = item.status === 'WARNING';

              return (
                <TouchableOpacity
                  key={item.categoryId}
                  style={[
                    styles.categoryCard,
                    isOverspent && styles.categoryCardOverspent,
                    isWarning && styles.categoryCardWarning,
                  ]}
                  onPress={() => handleOpenCategoryDetail(item)}
                  activeOpacity={0.8}
                >
                  {/* Fila Superior: Icono, Nombre y Status */}
                  <View style={styles.categoryCardHeader}>
                    <View style={styles.categoryTitleGroup}>
                      <View
                        style={[
                          styles.catIconWrap,
                          { backgroundColor: `${catColor}22` },
                        ]}
                      >
                        <Ionicons name={catIcon} size={18} color={catColor} />
                      </View>
                      <View>
                        <Text style={styles.catNameText} numberOfLines={1}>
                          {catName}
                        </Text>
                        <Text style={styles.catAllocationText}>
                          {item.percentageOfTotalBudget.toFixed(1)}% del presupuesto mensual
                        </Text>
                      </View>
                    </View>

                    {/* Tag de Estado */}
                    <View
                      style={[
                        styles.catStatusBadge,
                        isOverspent
                          ? styles.badgeDanger
                          : isWarning
                          ? styles.badgeWarning
                          : styles.badgeSafe,
                      ]}
                    >
                      <Ionicons
                        name={
                          isOverspent
                            ? 'alert-circle'
                            : isWarning
                            ? 'warning'
                            : 'checkmark-circle'
                        }
                        size={12}
                        color={
                          isOverspent
                            ? '#f87171'
                            : isWarning
                            ? '#fbbf24'
                            : '#34d399'
                        }
                        style={{ marginRight: 3 }}
                      />
                      <Text
                        style={[
                          styles.catStatusBadgeText,
                          isOverspent
                            ? styles.textDanger
                            : isWarning
                            ? styles.textWarning
                            : styles.textSafe,
                        ]}
                      >
                        {isOverspent
                          ? 'Sobregiro'
                          : isWarning
                          ? 'Advertencia'
                          : 'En regla'}
                      </Text>
                    </View>
                  </View>

                  {/* Barra de Progreso de la Categoría */}
                  <View style={styles.catProgressTrack}>
                    <View
                      style={[
                        styles.catProgressBar,
                        {
                          width: `${Math.min(item.percentageUsed, 100)}%`,
                          backgroundColor: isOverspent
                            ? '#ef4444'
                            : isWarning
                            ? '#f59e0b'
                            : '#10b981',
                        },
                      ]}
                    />
                  </View>

                  {/* Fila de Datos Financieros: Presupuesto, Consumido, Restante y Porcentaje */}
                  <View style={styles.catMetricsGrid}>
                    <View style={styles.catMetricItem}>
                      <Text style={styles.catMetricLabel}>Presupuesto</Text>
                      <Text style={styles.catMetricValue}>
                        ${item.budgetAmount.toFixed(2)}
                      </Text>
                    </View>

                    <View style={styles.catMetricItem}>
                      <Text style={styles.catMetricLabel}>Consumido</Text>
                      <Text
                        style={[
                          styles.catMetricValue,
                          isOverspent ? styles.textDanger : styles.textSpent,
                        ]}
                      >
                        ${item.spent.toFixed(2)}
                      </Text>
                    </View>

                    <View style={styles.catMetricItem}>
                      <Text style={styles.catMetricLabel}>
                        {isOverspent ? 'Excedido' : 'Restante'}
                      </Text>
                      <Text
                        style={[
                          styles.catMetricValue,
                          isOverspent ? styles.textOverspentAlert : styles.textRemaining,
                        ]}
                      >
                        {isOverspent
                          ? `+$${item.overspent.toFixed(2)}`
                          : `$${item.remaining.toFixed(2)}`}
                      </Text>
                    </View>

                    <View style={styles.catMetricItemRight}>
                      <Text style={styles.catMetricLabel}>% Consumido</Text>
                      <Text
                        style={[
                          styles.catMetricValueLarge,
                          isOverspent ? styles.textDanger : isWarning ? styles.textWarning : styles.textSafe,
                        ]}
                      >
                        {item.percentageUsed.toFixed(1)}%
                      </Text>
                    </View>
                  </View>

                  {/* Pie de la tarjeta: cantidad de transacciones */}
                  <View style={styles.catFooterRow}>
                    <Text style={styles.catTransactionsCountText}>
                      {item.transactionsCount}{' '}
                      {item.transactionsCount === 1 ? 'movimiento' : 'movimientos'}{' '}
                      registrados
                    </Text>
                    <View style={styles.detailLink}>
                      <Text style={styles.detailLinkText}>Ver detalle</Text>
                      <Ionicons name="chevron-forward" size={12} color="#6366f1" />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Modal de Detalle de Transacciones por Categoría */}
      <Modal
        visible={isDetailModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsDetailModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {selectedCategory?.categoryName || 'Detalle de Categoría'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {selectedCategory?.transactionsCount || 0} movimientos en {formattedMonth}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setIsDetailModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {/* Resumen en el Modal */}
            {selectedCategory ? (
              <View style={styles.modalStatsCard}>
                <View style={styles.modalStatCol}>
                  <Text style={styles.modalStatLabel}>Presupuesto</Text>
                  <Text style={styles.modalStatVal}>
                    ${selectedCategory.budgetAmount.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.modalStatCol}>
                  <Text style={styles.modalStatLabel}>Gastado</Text>
                  <Text
                    style={[
                      styles.modalStatVal,
                      selectedCategory.status === 'OVERSPENT' && styles.textDanger,
                    ]}
                  >
                    ${selectedCategory.spent.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.modalStatCol}>
                  <Text style={styles.modalStatLabel}>
                    {selectedCategory.status === 'OVERSPENT' ? 'Excedente' : 'Disponible'}
                  </Text>
                  <Text
                    style={[
                      styles.modalStatVal,
                      selectedCategory.status === 'OVERSPENT'
                        ? styles.textDanger
                        : styles.textSafe,
                    ]}
                  >
                    {selectedCategory.status === 'OVERSPENT'
                      ? `+$${selectedCategory.overspent.toFixed(2)}`
                      : `$${selectedCategory.remaining.toFixed(2)}`}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Lista de Movimientos */}
            <FlatList
              data={categoryTransactions}
              keyExtractor={(tx) => tx.id}
              contentContainerStyle={styles.modalListContent}
              ListEmptyComponent={
                <View style={styles.emptyModalContainer}>
                  <Ionicons name="receipt-outline" size={32} color="#64748b" />
                  <Text style={styles.emptyModalText}>
                    No hay transacciones registradas en este periodo
                  </Text>
                </View>
              }
              renderItem={({ item: tx }) => {
                const date = tx.occurredAt instanceof Date ? tx.occurredAt : new Date(tx.occurredAt);
                const isRefund = tx.status === 'REFUND';
                return (
                  <View style={styles.txModalItem}>
                    <View style={styles.txModalItemLeft}>
                      <View
                        style={[
                          styles.txIconCircle,
                          isRefund ? styles.txRefundCircle : styles.txExpenseCircle,
                        ]}
                      >
                        <Ionicons
                          name={isRefund ? 'arrow-undo' : 'arrow-forward'}
                          size={14}
                          color={isRefund ? '#34d399' : '#f87171'}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.txMerchantText} numberOfLines={1}>
                          {tx.merchant || tx.description || 'Movimiento'}
                        </Text>
                        <Text style={styles.txDateText}>
                          {date.toLocaleDateString('es-MX', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                          {isRefund ? ' • Reembolso / Deducción' : ''}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.txAmountText,
                        isRefund ? styles.textSafe : styles.textExpense,
                      ]}
                    >
                      {isRefund ? '-' : ''}${(tx.amountMinor / 100).toFixed(2)}
                    </Text>
                  </View>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  backPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  topTitleContainer: {
    flex: 1,
  },
  topTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  topSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  monthSelectorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  monthNavButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthDisplayText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f8fafc',
  },
  heroCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  heroCardNormal: {
    borderColor: '#334155',
  },
  heroCardWarning: {
    borderColor: '#78350f',
    backgroundColor: '#1c1917',
  },
  heroCardDanger: {
    borderColor: '#7f1d1d',
    backgroundColor: '#181114',
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  heroSubtext: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
    marginBottom: 4,
  },
  heroTitleAmount: {
    fontSize: 26,
    fontWeight: '800',
    color: '#f8fafc',
  },
  currencySmall: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94a3b8',
  },
  globalStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeSafe: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  badgeWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  badgeDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  globalStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  textSafe: {
    color: '#34d399',
  },
  textWarning: {
    color: '#fbbf24',
  },
  textDanger: {
    color: '#f87171',
  },
  textSpent: {
    color: '#38bdf8',
  },
  textRemaining: {
    color: '#34d399',
  },
  textOverspentAlert: {
    color: '#f87171',
    fontWeight: '700',
  },
  textDim: {
    color: '#64748b',
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#334155',
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  percentageText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#e2e8f0',
  },
  remainingPercentageText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  kpiCol: {
    flex: 1,
    alignItems: 'center',
  },
  kpiColDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#1e293b',
  },
  kpiLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 2,
    fontWeight: '500',
  },
  kpiValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  alertBannerSafe: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    marginBottom: 16,
  },
  alertBannerTitleSafe: {
    fontSize: 13,
    fontWeight: '700',
    color: '#34d399',
    marginBottom: 2,
  },
  alertBannerDescSafe: {
    fontSize: 12,
    color: '#94a3b8',
  },
  alertBannerWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    marginBottom: 16,
  },
  alertBannerTitleWarning: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fbbf24',
    marginBottom: 2,
  },
  alertBannerDescWarning: {
    fontSize: 12,
    color: '#cbd5e1',
  },
  alertBannerDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    marginBottom: 16,
  },
  alertBannerTitleDanger: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f87171',
    marginBottom: 2,
  },
  alertBannerDescDanger: {
    fontSize: 12,
    color: '#cbd5e1',
  },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterChipActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderColor: '#6366f1',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  filterChipTextActive: {
    color: '#818cf8',
  },
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 8,
  },
  emptyCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
    marginTop: 10,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
  },
  categoryList: {
    gap: 12,
  },
  categoryCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  categoryCardWarning: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  categoryCardOverspent: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  categoryCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  categoryTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  catIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  catNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
  },
  catAllocationText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  catStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  catStatusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  catProgressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0f172a',
    overflow: 'hidden',
    marginBottom: 10,
  },
  catProgressBar: {
    height: '100%',
    borderRadius: 3,
  },
  catMetricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  catMetricItem: {
    flex: 1,
  },
  catMetricItemRight: {
    alignItems: 'flex-end',
    minWidth: 70,
  },
  catMetricLabel: {
    fontSize: 10,
    color: '#94a3b8',
    marginBottom: 2,
    fontWeight: '500',
  },
  catMetricValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e2e8f0',
  },
  catMetricValueLarge: {
    fontSize: 14,
    fontWeight: '800',
  },
  catFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  catTransactionsCountText: {
    fontSize: 11,
    color: '#64748b',
  },
  detailLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailLinkText: {
    fontSize: 11,
    color: '#818cf8',
    fontWeight: '600',
    marginRight: 2,
  },
  unbudgetedSection: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
  },
  unbudgetedCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
  },
  unbudgetedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    marginBottom: 8,
  },
  unbudgetedTotalLabel: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  unbudgetedTotalAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
  },
  unbudgetedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  unbudgetedRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  unbudgetedMerchant: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f8fafc',
  },
  unbudgetedCategory: {
    fontSize: 11,
    color: '#64748b',
  },
  unbudgetedAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f87171',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalStatsCard: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  modalStatCol: {
    flex: 1,
    alignItems: 'center',
  },
  modalStatLabel: {
    fontSize: 11,
    color: '#94a3b8',
    marginBottom: 2,
  },
  modalStatVal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
  },
  modalListContent: {
    paddingBottom: 20,
  },
  emptyModalContainer: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyModalText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 8,
  },
  txModalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  txModalItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  txIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  txExpenseCircle: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  txRefundCircle: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  txMerchantText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f8fafc',
  },
  txDateText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  txAmountText: {
    fontSize: 14,
    fontWeight: '700',
  },
  textExpense: {
    color: '#f87171',
  },
});
