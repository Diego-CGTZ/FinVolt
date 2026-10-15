/**
 * FutureObligationsList — Componente Visual de Obligaciones Futuras (US-044)
 *
 * Muestra ingresos y gastos futuros comprometidos o esperados (salario, renta,
 * suscripciones, préstamos, tarjetas) con periodicidad, monto, próxima fecha
 * de vencimiento y relación con cuenta o categoría.
 *
 * REGLA ESTRICTA DE UI:
 * Cero emojis en cualquier elemento visual o texto. Uso exclusivo de
 * iconos vectoriales Ionicons y tipografía limpia.
 */

import React, { useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type {
  FutureObligation,
  ObligationType,
  ObligationPeriodicity,
  ObligationDirection,
  ObligationCertainty,
} from '../../../domain/models/FutureObligation';

export interface FutureObligationsListProps {
  obligations: FutureObligation[];
  onFulfill?: (item: FutureObligation) => void;
  onEdit?: (item: FutureObligation) => void;
  onDelete?: (item: FutureObligation) => void;
  onSelect?: (item: FutureObligation) => void;
}

type DirectionFilter = 'ALL' | ObligationDirection;

export function FutureObligationsList({
  obligations,
  onFulfill,
  onEdit,
  onDelete,
  onSelect,
}: FutureObligationsListProps) {
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('ALL');

  const filteredItems = obligations.filter((item) => {
    if (directionFilter === 'ALL') return true;
    return item.direction === directionFilter;
  });

  const getObligationIconName = (
    type: ObligationType,
  ): keyof typeof Ionicons.glyphMap => {
    switch (type) {
      case 'SALARY':
        return 'wallet-outline';
      case 'RENT':
        return 'home-outline';
      case 'SUBSCRIPTION':
        return 'play-circle-outline';
      case 'LOAN':
        return 'calendar-outline';
      case 'UTILITY':
        return 'flash-outline';
      case 'CREDIT_CARD_PAYMENT':
        return 'card-outline';
      default:
        return 'receipt-outline';
    }
  };

  const formatPeriodicity = (periodicity: ObligationPeriodicity): string => {
    switch (periodicity) {
      case 'WEEKLY':
        return 'Semanal';
      case 'BIWEEKLY':
        return 'Catorcenal';
      case 'SEMIMONTHLY':
        return 'Quincenal';
      case 'MONTHLY':
        return 'Mensual';
      case 'BIMONTHLY':
        return 'Bimestral';
      case 'QUARTERLY':
        return 'Trimestral';
      case 'ANNUAL':
        return 'Anual';
      case 'ONE_TIME':
        return 'Pago único';
      case 'CUSTOM':
        return 'Personalizado';
      default:
        return periodicity;
    }
  };

  const formatCertainty = (certainty: ObligationCertainty): string => {
    return certainty === 'COMMITTED' ? 'Comprometido' : 'Esperado';
  };

  const formatAmount = (minor: number, currency = 'MXN'): string => {
    const decimal = minor / 100;
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
    }).format(decimal);
  };

  const formatDueDiff = (dueDate: Date): { text: string; isPast: boolean; isToday: boolean } => {
    const now = new Date();
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const dueUtc = Date.UTC(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    const diffDays = Math.round((dueUtc - todayUtc) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return { text: 'Vence hoy', isPast: false, isToday: true };
    } else if (diffDays === 1) {
      return { text: 'Mañana', isPast: false, isToday: false };
    } else if (diffDays > 1) {
      return { text: `En ${diffDays} días`, isPast: false, isToday: false };
    } else {
      return { text: `Vencido hace ${Math.abs(diffDays)} días`, isPast: true, isToday: false };
    }
  };

  const renderItem = ({ item }: { item: FutureObligation }) => {
    const isIncome = item.direction === 'INCOME';
    const amountColor = isIncome ? '#10B981' : '#F43F5E';
    const amountPrefix = isIncome ? '+' : '-';
    const dueInfo = formatDueDiff(new Date(item.nextDueDate));

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => onSelect?.(item)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.iconContainer}>
            <Ionicons
              name={getObligationIconName(item.obligationType)}
              size={22}
              color="#38BDF8"
            />
          </View>

          <View style={styles.headerInfo}>
            <Text style={styles.obligationName} numberOfLines={1}>
              {item.name}
            </Text>
            {item.description ? (
              <Text style={styles.obligationDesc} numberOfLines={1}>
                {item.description}
              </Text>
            ) : null}
          </View>

          <View style={styles.amountContainer}>
            <Text style={[styles.amountText, { color: amountColor }]}>
              {amountPrefix}{formatAmount(item.amountMinor, item.currency)}
            </Text>
            <Text style={styles.currencyCode}>{item.currency}</Text>
          </View>
        </View>

        <View style={styles.badgesRow}>
          <View style={styles.badge}>
            <Ionicons name="repeat-outline" size={12} color="#94A3B8" />
            <Text style={styles.badgeText}>{formatPeriodicity(item.periodicity)}</Text>
          </View>

          <View
            style={[
              styles.badge,
              item.certainty === 'COMMITTED'
                ? styles.committedBadge
                : styles.expectedBadge,
            ]}
          >
            <Ionicons
              name={item.certainty === 'COMMITTED' ? 'shield-checkmark-outline' : 'help-circle-outline'}
              size={12}
              color={item.certainty === 'COMMITTED' ? '#38BDF8' : '#F59E0B'}
            />
            <Text
              style={[
                styles.badgeText,
                { color: item.certainty === 'COMMITTED' ? '#38BDF8' : '#F59E0B' },
              ]}
            >
              {formatCertainty(item.certainty)}
            </Text>
          </View>

          <View
            style={[
              styles.badge,
              dueInfo.isPast
                ? styles.pastBadge
                : dueInfo.isToday
                ? styles.todayBadge
                : styles.futureBadge,
            ]}
          >
            <Ionicons
              name="time-outline"
              size={12}
              color={dueInfo.isPast ? '#F43F5E' : dueInfo.isToday ? '#F59E0B' : '#94A3B8'}
            />
            <Text
              style={[
                styles.badgeText,
                dueInfo.isPast
                  ? { color: '#F43F5E' }
                  : dueInfo.isToday
                  ? { color: '#F59E0B' }
                  : null,
              ]}
            >
              {dueInfo.text}
            </Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          <Text style={styles.dateLabel}>
            Próximo vencimiento: {new Date(item.nextDueDate).toLocaleDateString('es-MX')}
          </Text>

          <View style={styles.actionButtons}>
            {onFulfill && item.status === 'ACTIVE' ? (
              <TouchableOpacity
                style={styles.fulfillButton}
                onPress={() => onFulfill(item)}
              >
                <Ionicons name="checkmark-outline" size={14} color="#0284C7" />
                <Text style={styles.fulfillButtonText}>Cumplir</Text>
              </TouchableOpacity>
            ) : null}

            {onEdit ? (
              <TouchableOpacity
                style={styles.iconAction}
                onPress={() => onEdit(item)}
              >
                <Ionicons name="create-outline" size={16} color="#64748B" />
              </TouchableOpacity>
            ) : null}

            {onDelete ? (
              <TouchableOpacity
                style={styles.iconAction}
                onPress={() => onDelete(item)}
              >
                <Ionicons name="trash-outline" size={16} color="#64748B" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Selector de pestañas de dirección */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tab, directionFilter === 'ALL' && styles.activeTab]}
          onPress={() => setDirectionFilter('ALL')}
        >
          <Text
            style={[
              styles.tabText,
              directionFilter === 'ALL' && styles.activeTabText,
            ]}
          >
            Todas
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, directionFilter === 'EXPENSE' && styles.activeTab]}
          onPress={() => setDirectionFilter('EXPENSE')}
        >
          <Text
            style={[
              styles.tabText,
              directionFilter === 'EXPENSE' && styles.activeTabText,
            ]}
          >
            Gastos
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, directionFilter === 'INCOME' && styles.activeTab]}
          onPress={() => setDirectionFilter('INCOME')}
        >
          <Text
            style={[
              styles.tabText,
              directionFilter === 'INCOME' && styles.activeTabText,
            ]}
          >
            Ingresos
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={48} color="#334155" />
            <Text style={styles.emptyTitle}>Sin obligaciones registradas</Text>
            <Text style={styles.emptySubtitle}>
              Las obligaciones futuras comprometidas o esperadas aparecerán aquí.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    gap: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1E293B',
  },
  activeTab: {
    backgroundColor: '#0284C7',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#94A3B8',
  },
  activeTabText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerInfo: {
    flex: 1,
    marginRight: 8,
  },
  obligationName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  obligationDesc: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 15,
    fontWeight: '700',
  },
  currencyCode: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  badgeText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  committedBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  expectedBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  todayBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  pastBadge: {
    backgroundColor: 'rgba(244, 63, 94, 0.15)',
  },
  futureBadge: {
    backgroundColor: '#0F172A',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 10,
  },
  dateLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fulfillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(2, 132, 199, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  fulfillButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#38BDF8',
  },
  iconAction: {
    padding: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94A3B8',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
