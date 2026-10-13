/**
 * RecurringTransactionsList — Componente Visual de Transacciones Recurrentes (US-043)
 *
 * Muestra las operaciones periódicas detectadas (salario, renta, suscripciones,
 * préstamos, servicios, etc.) con periodicidad, índice de confianza, monto y
 * fecha estimada de la próxima ocurrencia.
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
  RecurringPatternType,
  RecurringPeriodicity,
  RecurringTransaction,
} from '../../../domain/models/RecurringTransaction';

export interface RecurringTransactionsListProps {
  items: RecurringTransaction[];
  onConfirm?: (item: RecurringTransaction) => void;
  onPause?: (item: RecurringTransaction) => void;
  onDismiss?: (item: RecurringTransaction) => void;
  onSelect?: (item: RecurringTransaction) => void;
}

type FilterTab = 'ALL' | RecurringPatternType;

export function RecurringTransactionsList({
  items,
  onConfirm,
  onPause,
  onDismiss,
  onSelect,
}: RecurringTransactionsListProps) {
  const [selectedTab, setSelectedTab] = useState<FilterTab>('ALL');

  const filteredItems = items.filter((item) => {
    if (selectedTab === 'ALL') return true;
    return item.patternType === selectedTab;
  });

  const getPatternIconName = (
    patternType: RecurringPatternType,
  ): keyof typeof Ionicons.glyphMap => {
    switch (patternType) {
      case 'SALARY':
        return 'cash-outline';
      case 'RENT':
        return 'home-outline';
      case 'SUBSCRIPTION':
        return 'tv-outline';
      case 'LOAN':
        return 'card-outline';
      case 'UTILITY':
        return 'flash-outline';
      case 'OTHER':
      default:
        return 'repeat-outline';
    }
  };

  const getPeriodicityLabel = (periodicity: RecurringPeriodicity): string => {
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
      case 'CUSTOM':
      default:
        return 'Periódico';
    }
  };

  const formatCurrency = (amountMinor: number, currency: string): string => {
    const units = (amountMinor / 100).toFixed(2);
    return `$${Number(units).toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${currency}`;
  };

  const formatDate = (date: Date): string => {
    const d = new Date(date);
    return d.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const renderItem = ({ item }: { item: RecurringTransaction }) => {
    const isIncome = item.transactionType === 'INCOME';
    const iconName = getPatternIconName(item.patternType);
    const periodicityLabel = getPeriodicityLabel(item.periodicity);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => onSelect?.(item)}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.iconContainer, isIncome ? styles.iconIncome : styles.iconExpense]}>
            <Ionicons
              name={iconName}
              size={22}
              color={isIncome ? '#059669' : '#DC2626'}
            />
          </View>

          <View style={styles.headerInfo}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.name}
            </Text>
            <View style={styles.metaRow}>
              <View style={styles.badgePeriodicity}>
                <Ionicons name="time-outline" size={12} color="#4B5563" />
                <Text style={styles.badgeText}>{periodicityLabel}</Text>
              </View>

              <View
                style={[
                  styles.badgeConfidence,
                  item.confidenceScore >= 80
                    ? styles.confHigh
                    : item.confidenceScore >= 60
                    ? styles.confMid
                    : styles.confLow,
                ]}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={12}
                  color={
                    item.confidenceScore >= 80
                      ? '#065F46'
                      : item.confidenceScore >= 60
                      ? '#92400E'
                      : '#991B1B'
                  }
                />
                <Text
                  style={[
                    styles.confidenceText,
                    item.confidenceScore >= 80
                      ? styles.confTextHigh
                      : item.confidenceScore >= 60
                      ? styles.confTextMid
                      : styles.confTextLow,
                  ]}
                >
                  {item.confidenceScore}% confianza
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.amountContainer}>
            <Text
              style={[
                styles.amountText,
                isIncome ? styles.amountIncome : styles.amountExpense,
              ]}
            >
              {isIncome ? '+' : '-'} {formatCurrency(item.averageAmountMinor, item.currency)}
            </Text>
            {item.isVariableAmount && (
              <Text style={styles.variableLabel}>Monto variable</Text>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.cardFooter}>
          <View style={styles.footerInfo}>
            <Ionicons name="calendar-outline" size={14} color="#6B7280" />
            <Text style={styles.footerDateText}>
              Próximo: {formatDate(item.nextExpectedOccurrence)}
            </Text>
            <Text style={styles.footerCountText}>
              ({item.occurrenceCount} movimientos)
            </Text>
          </View>

          <View style={styles.actionsRow}>
            {item.status === 'DETECTED' && onConfirm && (
              <TouchableOpacity
                style={styles.actionBtnConfirm}
                onPress={() => onConfirm(item)}
              >
                <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                <Text style={styles.actionBtnConfirmText}>Confirmar</Text>
              </TouchableOpacity>
            )}

            {item.status === 'CONFIRMED' && onPause && (
              <TouchableOpacity
                style={styles.actionBtnSecondary}
                onPress={() => onPause(item)}
              >
                <Ionicons name="pause-outline" size={14} color="#4B5563" />
                <Text style={styles.actionBtnSecondaryText}>Pausar</Text>
              </TouchableOpacity>
            )}

            {onDismiss && (
              <TouchableOpacity
                style={styles.actionBtnDismiss}
                onPress={() => onDismiss(item)}
              >
                <Ionicons name="close" size={14} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const tabs: { id: FilterTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'ALL', label: 'Todos', icon: 'grid-outline' },
    { id: 'SALARY', label: 'Salarios', icon: 'cash-outline' },
    { id: 'RENT', label: 'Rentas', icon: 'home-outline' },
    { id: 'SUBSCRIPTION', label: 'Suscripciones', icon: 'tv-outline' },
    { id: 'LOAN', label: 'Préstamos', icon: 'card-outline' },
    { id: 'UTILITY', label: 'Servicios', icon: 'flash-outline' },
  ];

  return (
    <View style={styles.container}>
      {/* Selector de pestañas por tipo de patrón */}
      <View style={styles.tabsContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={tabs}
          keyExtractor={(tab) => tab.id}
          renderItem={({ item: tab }) => {
            const isSelected = selectedTab === tab.id;
            return (
              <TouchableOpacity
                style={[styles.tabButton, isSelected && styles.tabButtonActive]}
                onPress={() => setSelectedTab(tab.id)}
              >
                <Ionicons
                  name={tab.icon}
                  size={14}
                  color={isSelected ? '#FFFFFF' : '#4B5563'}
                />
                <Text
                  style={[styles.tabText, isSelected && styles.tabTextActive]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.tabsScrollContent}
        />
      </View>

      {/* Lista de operaciones recurrentes */}
      {filteredItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="repeat-outline" size={48} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>Sin transacciones recurrentes</Text>
          <Text style={styles.emptySubtitle}>
            No se han detectado operaciones periódicas para este filtro.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  tabsContainer: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  tabsScrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 6,
    gap: 4,
  },
  tabButtonActive: {
    backgroundColor: '#2563EB',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4B5563',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconIncome: {
    backgroundColor: '#ECFDF5',
  },
  iconExpense: {
    backgroundColor: '#FEF2F2',
  },
  headerInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgePeriodicity: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#4B5563',
  },
  badgeConfidence: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  confHigh: {
    backgroundColor: '#D1FAE5',
  },
  confMid: {
    backgroundColor: '#FEF3C7',
  },
  confLow: {
    backgroundColor: '#FEE2E2',
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: '600',
  },
  confTextHigh: {
    color: '#065F46',
  },
  confTextMid: {
    color: '#92400E',
  },
  confTextLow: {
    color: '#991B1B',
  },
  amountContainer: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  amountText: {
    fontSize: 15,
    fontWeight: '700',
  },
  amountIncome: {
    color: '#059669',
  },
  amountExpense: {
    color: '#111827',
  },
  variableLabel: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  footerDateText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '500',
  },
  footerCountText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtnConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  actionBtnConfirmText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  actionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  actionBtnSecondaryText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '500',
  },
  actionBtnDismiss: {
    padding: 4,
    borderRadius: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    marginTop: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
  },
});
