/**
 * BudgetList — Componente Visual de Presupuestos Mensuales (US-046)
 *
 * Muestra los presupuestos por categoría asignados a un mes, con montos, porcentajes,
 * barra de distribución global y validación visual de la regla ≤ 100%.
 *
 * REGLA ESTRICTA DE UI:
 * Cero emojis en cualquier elemento visual o texto. Uso exclusivo de
 * iconos vectoriales Ionicons y tipografía limpia.
 */

import React from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Budget, BudgetMonthlySummary } from '../../../domain/models/Budget';
import type { Category } from '../../../domain/models/Category';

export interface BudgetListProps {
  summary: BudgetMonthlySummary;
  categories?: Record<string, Category>;
  onEdit?: (budget: Budget) => void;
  onDelete?: (budget: Budget) => void;
  onAddPress?: () => void;
  onPrevMonth?: () => void;
  onNextMonth?: () => void;
}

export function BudgetList({
  summary,
  categories = {},
  onEdit,
  onDelete,
  onAddPress,
  onPrevMonth,
  onNextMonth,
}: BudgetListProps) {
  const isOverflow = summary.totalPercentage > 100;
  const isComplete = summary.isFullyAllocated;

  const renderBudgetItem = ({ item }: { item: Budget }) => {
    const category = categories[item.categoryId];
    const categoryName = category ? category.name : 'Categoría';
    const categoryIcon = (category?.icon as any) || 'pricetag';
    const categoryColor = category?.color || '#38bdf8';

    return (
      <View style={styles.card}>
        <View style={styles.cardLeft}>
          <View
            style={[
              styles.iconWrapper,
              { backgroundColor: `${categoryColor}22` },
            ]}
          >
            <Ionicons name={categoryIcon} size={18} color={categoryColor} />
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.categoryName} numberOfLines={1}>
              {categoryName}
            </Text>
            {item.notes ? (
              <Text style={styles.notesText} numberOfLines={1}>
                {item.notes}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.cardRight}>
          <View style={styles.amountCol}>
            <Text style={styles.amountText}>
              ${item.amount.toFixed(2)}{' '}
              <Text style={styles.currencyCode}>{item.currency}</Text>
            </Text>
            <View style={styles.percentageBadge}>
              <Text style={styles.percentageText}>
                {item.percentage.toFixed(1)}%
              </Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            {onEdit && (
              <TouchableOpacity
                onPress={() => onEdit(item)}
                style={styles.actionBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="create-outline" size={16} color="#94a3b8" />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity
                onPress={() => onDelete(item)}
                style={styles.actionBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={16} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Selector de Mes */}
      <View style={styles.monthHeader}>
        <TouchableOpacity
          onPress={onPrevMonth}
          style={styles.navBtn}
          disabled={!onPrevMonth}
        >
          <Ionicons name="chevron-back" size={18} color="#94a3b8" />
        </TouchableOpacity>

        <View style={styles.monthTitleWrapper}>
          <Ionicons name="calendar-outline" size={16} color="#38bdf8" />
          <Text style={styles.monthTitle}>Periodo {summary.month}</Text>
        </View>

        <TouchableOpacity
          onPress={onNextMonth}
          style={styles.navBtn}
          disabled={!onNextMonth}
        >
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* Resumen de Asignación y Barra de Distribución */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryTop}>
          <View>
            <Text style={styles.summaryLabel}>Total Presupuestado</Text>
            <Text style={styles.summaryAmount}>
              ${summary.totalBudgeted.toFixed(2)}{' '}
              <Text style={styles.currencyCode}>{summary.currency}</Text>
            </Text>
          </View>

          <View
            style={[
              styles.statusPill,
              isOverflow
                ? styles.pillDanger
                : isComplete
                ? styles.pillComplete
                : styles.pillActive,
            ]}
          >
            <Ionicons
              name={
                isOverflow
                  ? 'alert-circle'
                  : isComplete
                  ? 'checkmark-done-circle'
                  : 'pie-chart'
              }
              size={14}
              color={
                isOverflow
                  ? '#ef4444'
                  : isComplete
                  ? '#10b981'
                  : '#38bdf8'
              }
            />
            <Text
              style={[
                styles.statusPillText,
                isOverflow
                  ? styles.textDanger
                  : isComplete
                  ? styles.textSuccess
                  : styles.textAccent,
              ]}
            >
              {isOverflow
                ? 'Excede 100%'
                : isComplete
                ? '100% Asignado'
                : `${summary.remainingPercentage.toFixed(1)}% Disponible`}
            </Text>
          </View>
        </View>

        {/* Barra de Progreso de Porcentaje */}
        <View style={styles.progressBarTrack}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${Math.min(100, summary.totalPercentage)}%` },
              isOverflow
                ? styles.barDanger
                : isComplete
                ? styles.barComplete
                : styles.barNormal,
            ]}
          />
        </View>

        <View style={styles.progressFooter}>
          <Text style={styles.progressText}>
            Asignado: {summary.totalPercentage.toFixed(1)}% de 100%
          </Text>
          <Text style={styles.categoryCount}>
            {summary.budgets.length} categorías
          </Text>
        </View>
      </View>

      {/* Botón para Añadir Presupuesto si hay disponible */}
      {onAddPress && (
        <TouchableOpacity
          style={styles.addButton}
          onPress={onAddPress}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle-outline" size={18} color="#38bdf8" />
          <Text style={styles.addButtonText}>Asignar Presupuesto</Text>
        </TouchableOpacity>
      )}

      {/* Lista de Presupuestos */}
      {summary.budgets.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="file-tray-outline" size={36} color="#64748b" />
          <Text style={styles.emptyTitle}>Sin presupuestos definidos</Text>
          <Text style={styles.emptySubtitle}>
            Asigna montos y porcentajes a tus categorías para este mes.
          </Text>
        </View>
      ) : (
        <FlatList
          data={summary.budgets}
          keyExtractor={(item) => item.id}
          renderItem={renderBudgetItem}
          scrollEnabled={false}
          contentContainerStyle={styles.listContent}
        />
      )}
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
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  navBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  monthTitleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  monthTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
  },
  summaryCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  summaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
  },
  summaryAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f8fafc',
    marginTop: 2,
  },
  currencyCode: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pillActive: {
    backgroundColor: '#38bdf822',
  },
  pillComplete: {
    backgroundColor: '#10b98122',
  },
  pillDanger: {
    backgroundColor: '#ef444422',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  textAccent: {
    color: '#38bdf8',
  },
  textSuccess: {
    color: '#10b981',
  },
  textDanger: {
    color: '#ef4444',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#0b1120',
    borderRadius: 4,
    overflow: 'hidden',
    marginVertical: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  barNormal: {
    backgroundColor: '#38bdf8',
  },
  barComplete: {
    backgroundColor: '#10b981',
  },
  barDanger: {
    backgroundColor: '#ef4444',
  },
  progressFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  progressText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  categoryCount: {
    fontSize: 11,
    color: '#64748b',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#38bdf844',
    marginBottom: 12,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#38bdf8',
  },
  listContent: {
    gap: 8,
  },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  iconWrapper: {
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
  },
  notesText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  amountCol: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f8fafc',
  },
  percentageBadge: {
    backgroundColor: '#0b1120',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  percentageText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#38bdf8',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    padding: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#cbd5e1',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
