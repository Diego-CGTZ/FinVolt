/**
 * BudgetConsumptionCard — Componente Visual de Consumo de Presupuesto (US-047)
 *
 * Muestra el progreso de consumo de presupuestos por categoría en el mes,
 * barras de porcentaje, alertas de sobregiro y gastos no presupuestados.
 *
 * REGLA ESTRICTA DE UI:
 * Cero emojis en cualquier elemento visual o texto. Uso exclusivo de
 * iconos vectoriales Ionicons y tipografía limpia.
 */

import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type {
  MonthlyBudgetConsumptionSummary,
  CategoryBudgetConsumption,
} from '../../../domain/models/BudgetConsumption';

export interface BudgetConsumptionCardProps {
  summary: MonthlyBudgetConsumptionSummary;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
  onCategoryPress?: (category: CategoryBudgetConsumption) => void;
}

export function BudgetConsumptionCard({
  summary,
  onPrevMonth,
  onNextMonth,
  onCategoryPress,
}: BudgetConsumptionCardProps) {
  const isGlobalOverspent = summary.totalSpentMinor > summary.totalBudgetedMinor;
  const isGlobalWarning = summary.overallPercentageUsed >= 80 && !isGlobalOverspent;

  return (
    <View style={styles.container}>
      {/* Encabezado con Selector de Mes */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="pie-chart" size={18} color="#38bdf8" />
          </View>
          <View>
            <Text style={styles.title}>Consumo de Presupuesto</Text>
            <Text style={styles.subtitle}>Periodo {summary.month}</Text>
          </View>
        </View>

        <View style={styles.monthNav}>
          <TouchableOpacity
            onPress={onPrevMonth}
            style={styles.navBtn}
            disabled={!onPrevMonth}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={16} color="#94a3b8" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onNextMonth}
            style={styles.navBtn}
            disabled={!onNextMonth}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Resumen Global */}
      <View
        style={[
          styles.mainCard,
          isGlobalOverspent
            ? styles.cardDanger
            : isGlobalWarning
            ? styles.cardWarning
            : styles.cardSafe,
        ]}
      >
        <View style={styles.mainTopRow}>
          <Text style={styles.mainLabel}>Total Consumido del Mes</Text>
          <View
            style={[
              styles.statusTag,
              isGlobalOverspent
                ? styles.tagDanger
                : isGlobalWarning
                ? styles.tagWarning
                : styles.tagSafe,
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
              size={12}
              color={
                isGlobalOverspent
                  ? '#ef4444'
                  : isGlobalWarning
                  ? '#f59e0b'
                  : '#10b981'
              }
            />
            <Text
              style={[
                styles.statusTagText,
                isGlobalOverspent
                  ? styles.textDanger
                  : isGlobalWarning
                  ? styles.textWarning
                  : styles.textSafe,
              ]}
            >
              {isGlobalOverspent
                ? 'Presupuesto Excedido'
                : isGlobalWarning
                ? 'Límite Próximo'
                : 'En Meta'}
            </Text>
          </View>
        </View>

        <Text
          style={[
            styles.mainAmount,
            isGlobalOverspent
              ? styles.textDanger
              : isGlobalWarning
              ? styles.textWarning
              : styles.textSafe,
          ]}
        >
          ${summary.totalSpent.toFixed(2)}{' '}
          <Text style={styles.budgetTarget}>
            / ${summary.totalBudgeted.toFixed(2)} {summary.currency}
          </Text>
        </Text>

        {/* Barra de Progreso Global */}
        <View style={styles.progressBarTrack}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${Math.min(100, summary.overallPercentageUsed)}%`,
              },
              isGlobalOverspent
                ? styles.barDanger
                : isGlobalWarning
                ? styles.barWarning
                : styles.barSafe,
            ]}
          />
        </View>

        <View style={styles.mainFooterRow}>
          <Text style={styles.footerText}>
            Consumido: {summary.overallPercentageUsed.toFixed(1)}%
          </Text>
          <Text style={styles.footerText}>
            {isGlobalOverspent
              ? `Exceso: -$${summary.totalOverspent.toFixed(2)}`
              : `Disponible: $${summary.totalRemaining.toFixed(2)}`}
          </Text>
        </View>
      </View>

      {/* Alerta de Gastos No Presupuestados si existen */}
      {summary.unbudgetedSpentMinor > 0 && (
        <View style={styles.unbudgetedBanner}>
          <Ionicons name="information-circle-outline" size={16} color="#38bdf8" />
          <View style={styles.unbudgetedContent}>
            <Text style={styles.unbudgetedTitle}>Gastos no presupuestados</Text>
            <Text style={styles.unbudgetedDesc}>
              ${summary.unbudgetedSpent.toFixed(2)} {summary.currency} en{' '}
              {summary.unbudgetedTransactionsCount} movimientos sin presupuesto.
            </Text>
          </View>
        </View>
      )}

      {/* Lista de Categorías */}
      <View style={styles.categoriesList}>
        <Text style={styles.sectionTitle}>
          Desglose por Categoría ({summary.categories.length})
        </Text>

        {summary.categories.length === 0 ? (
          <Text style={styles.emptyText}>
            No hay presupuestos configurados para este mes.
          </Text>
        ) : (
          summary.categories.map((cat) => {
            const isCatOver = cat.status === 'OVERSPENT';
            const isCatWarn = cat.status === 'WARNING';
            const catIcon = (cat.categoryIcon as any) || 'pricetag';
            const catColor = cat.categoryColor || '#38bdf8';

            return (
              <TouchableOpacity
                key={cat.budgetId}
                style={styles.categoryItem}
                onPress={() => onCategoryPress && onCategoryPress(cat)}
                activeOpacity={0.7}
                disabled={!onCategoryPress}
              >
                <View style={styles.categoryTop}>
                  <View style={styles.catLeft}>
                    <View
                      style={[
                        styles.catIconWrapper,
                        { backgroundColor: `${catColor}22` },
                      ]}
                    >
                      <Ionicons name={catIcon} size={16} color={catColor} />
                    </View>
                    <View>
                      <Text style={styles.catName} numberOfLines={1}>
                        {cat.categoryName}
                      </Text>
                      <Text style={styles.catMeta}>
                        {cat.transactionsCount} movimientos
                      </Text>
                    </View>
                  </View>

                  <View style={styles.catRight}>
                    <Text style={styles.catSpent}>
                      ${cat.spent.toFixed(2)}{' '}
                      <Text style={styles.catBudget}>
                        / ${cat.budgetAmount.toFixed(2)}
                      </Text>
                    </Text>
                    <View
                      style={[
                        styles.catPercentBadge,
                        isCatOver
                          ? styles.tagDanger
                          : isCatWarn
                          ? styles.tagWarning
                          : styles.tagSafe,
                      ]}
                    >
                      <Text
                        style={[
                          styles.catPercentText,
                          isCatOver
                            ? styles.textDanger
                            : isCatWarn
                            ? styles.textWarning
                            : styles.textSafe,
                        ]}
                      >
                        {cat.percentageUsed.toFixed(0)}%
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Barra de progreso de la categoría */}
                <View style={styles.catTrack}>
                  <View
                    style={[
                      styles.catFill,
                      {
                        width: `${Math.min(100, cat.percentageUsed)}%`,
                      },
                      isCatOver
                        ? styles.barDanger
                        : isCatWarn
                        ? styles.barWarning
                        : styles.barSafe,
                    ]}
                  />
                </View>

                <View style={styles.catFooter}>
                  <Text style={styles.catFooterText}>
                    {isCatOver
                      ? `Excedido por $${cat.overspent.toFixed(2)}`
                      : `Restante: $${cat.remaining.toFixed(2)}`}
                  </Text>
                  <Text style={styles.catShareText}>
                    {cat.percentageOfTotalBudget.toFixed(1)}% del presupuesto
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginVertical: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#38bdf822',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
  },
  subtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 1,
  },
  monthNav: {
    flexDirection: 'row',
    gap: 6,
  },
  navBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  mainCard: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  cardSafe: {
    backgroundColor: '#064e3b22',
    borderColor: '#065f46',
  },
  cardWarning: {
    backgroundColor: '#78350f22',
    borderColor: '#92400e',
  },
  cardDanger: {
    backgroundColor: '#7f1d1d22',
    borderColor: '#991b1b',
  },
  mainTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  mainLabel: {
    fontSize: 12,
    color: '#cbd5e1',
    fontWeight: '500',
  },
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  tagSafe: {
    backgroundColor: '#10b98122',
  },
  tagWarning: {
    backgroundColor: '#f59e0b22',
  },
  tagDanger: {
    backgroundColor: '#ef444422',
  },
  statusTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  mainAmount: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginVertical: 4,
  },
  budgetTarget: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94a3b8',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#0b1120',
    borderRadius: 4,
    overflow: 'hidden',
    marginVertical: 6,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  barSafe: {
    backgroundColor: '#10b981',
  },
  barWarning: {
    backgroundColor: '#f59e0b',
  },
  barDanger: {
    backgroundColor: '#ef4444',
  },
  mainFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  footerText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
  },
  textSafe: {
    color: '#10b981',
  },
  textWarning: {
    color: '#f59e0b',
  },
  textDanger: {
    color: '#ef4444',
  },
  unbudgetedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#38bdf814',
    borderWidth: 1,
    borderColor: '#0284c744',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    marginBottom: 12,
  },
  unbudgetedContent: {
    flex: 1,
  },
  unbudgetedTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38bdf8',
  },
  unbudgetedDesc: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  categoriesList: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e2e8f0',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 12,
  },
  categoryItem: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  categoryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  catLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  catIconWrapper: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  catName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8fafc',
  },
  catMeta: {
    fontSize: 10,
    color: '#64748b',
  },
  catRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  catSpent: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8fafc',
  },
  catBudget: {
    fontSize: 11,
    fontWeight: '400',
    color: '#94a3b8',
  },
  catPercentBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  catPercentText: {
    fontSize: 10,
    fontWeight: '700',
  },
  catTrack: {
    height: 6,
    backgroundColor: '#0b1120',
    borderRadius: 3,
    overflow: 'hidden',
    marginVertical: 4,
  },
  catFill: {
    height: '100%',
    borderRadius: 3,
  },
  catFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  catFooterText: {
    fontSize: 10,
    color: '#94a3b8',
    fontWeight: '500',
  },
  catShareText: {
    fontSize: 10,
    color: '#64748b',
  },
});
