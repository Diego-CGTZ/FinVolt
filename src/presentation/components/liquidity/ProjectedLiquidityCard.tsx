/**
 * ProjectedLiquidityCard — Componente Visual de Liquidez Proyectada (US-045)
 *
 * Muestra la liquidez futura calculada mediante la fórmula canónica de AC:
 *   Liquid Assets + Expected Income - Credit Obligations - Committed Expenses
 *
 * Características:
 * - Selector interactivo de horizonte (7D, 15D, 30D, 60D, 90D).
 * - Visualización de activos líquidos, ingresos esperados, obligaciones de crédito y gastos comprometidos.
 * - Alerta visual ante caídas de liquidez o déficit proyectado (< $0).
 * - Desglose de eventos y trayectoria temporal diaria.
 *
 * REGLA ESTRICTA DE UI:
 * Cero emojis en cualquier elemento visual o texto. Uso exclusivo de iconos
 * vectoriales Ionicons y tipografía limpia.
 */

import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import type { Account } from '../../../domain/models/Account';
import type { Transaction } from '../../../domain/models/Transaction';
import type { FutureObligation } from '../../../domain/models/FutureObligation';
import type {
  LiquidityHorizonPreset,
  ProjectedLiquidityPoint,
  ProjectedLiquidityEvent,
} from '../../../domain/models/ProjectedLiquidity';
import { ProjectedLiquidityCalculator } from '../../../domain/services/liquidity/ProjectedLiquidityCalculator';

export interface ProjectedLiquidityCardProps {
  accounts: Account[];
  transactions?: Transaction[];
  obligations: FutureObligation[];
  initialHorizon?: LiquidityHorizonPreset;
  onHorizonChange?: (days: number) => void;
  onEventPress?: (event: ProjectedLiquidityEvent) => void;
}

const HORIZON_PRESETS: { label: string; days: LiquidityHorizonPreset }[] = [
  { label: '7D', days: 7 },
  { label: '15D', days: 15 },
  { label: '30D', days: 30 },
  { label: '60D', days: 60 },
  { label: '90D', days: 90 },
];

export function ProjectedLiquidityCard({
  accounts,
  transactions = [],
  obligations,
  initialHorizon = 30,
  onHorizonChange,
  onEventPress,
}: ProjectedLiquidityCardProps) {
  const [selectedHorizon, setSelectedHorizon] = useState<number>(initialHorizon);
  const [showTimeline, setShowTimeline] = useState<boolean>(false);

  const handleSelectHorizon = (days: number) => {
    setSelectedHorizon(days);
    if (onHorizonChange) {
      onHorizonChange(days);
    }
  };

  const projection = useMemo(() => {
    return ProjectedLiquidityCalculator.calculate({
      accounts,
      transactions,
      obligations,
      config: {
        horizonDays: selectedHorizon,
      },
    });
  }, [accounts, transactions, obligations, selectedHorizon]);

  const isWarning = projection.finalProjectedLiquidity >= 0 && projection.isDeficitProjected;
  const isDanger = projection.finalProjectedLiquidity < 0;


  // Filtrar los días de la línea de tiempo que tienen eventos o cambios relevantes
  const activeTimelinePoints = useMemo(() => {
    return projection.timeline.filter(
      (p: ProjectedLiquidityPoint) => p.events.length > 0 || p.dayIndex === 0
    );
  }, [projection.timeline]);

  return (
    <View style={styles.container}>
      {/* Encabezado */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={styles.iconBadge}>
            <Ionicons name="trending-up" size={18} color="#38bdf8" />
          </View>
          <View>
            <Text style={styles.title}>Liquidez Proyectada</Text>
            <Text style={styles.subtitle}>
              Horizonte a {selectedHorizon} días • AC canónico
            </Text>
          </View>
        </View>

        {/* Selector de Horizonte */}
        <View style={styles.horizonSelector}>
          {HORIZON_PRESETS.map((preset) => {
            const isSelected = selectedHorizon === preset.days;
            return (
              <TouchableOpacity
                key={preset.days}
                style={[styles.horizonPill, isSelected && styles.horizonPillActive]}
                onPress={() => handleSelectHorizon(preset.days)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.horizonPillText,
                    isSelected && styles.horizonPillTextActive,
                  ]}
                >
                  {preset.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Saldo Principal Proyectado */}
      <View
        style={[
          styles.mainCard,
          isDanger
            ? styles.cardDanger
            : isWarning
            ? styles.cardWarning
            : styles.cardSafe,
        ]}
      >
        <View style={styles.mainTopRow}>
          <Text style={styles.mainLabel}>Liquidez Final Estimada</Text>
          <View
            style={[
              styles.statusTag,
              isDanger
                ? styles.tagDanger
                : isWarning
                ? styles.tagWarning
                : styles.tagSafe,
            ]}
          >
            <Ionicons
              name={
                isDanger
                  ? 'alert-circle'
                  : isWarning
                  ? 'warning'
                  : 'shield-checkmark'
              }
              size={12}
              color={isDanger ? '#ef4444' : isWarning ? '#f59e0b' : '#10b981'}
            />
            <Text
              style={[
                styles.statusTagText,
                isDanger
                  ? styles.textDanger
                  : isWarning
                  ? styles.textWarning
                  : styles.textSafe,
              ]}
            >
              {isDanger
                ? 'Déficit al Cierre'
                : isWarning
                ? 'Riesgo Temporal'
                : 'Flujo Positivo'}
            </Text>
          </View>
        </View>

        <Text
          style={[
            styles.mainAmount,
            isDanger ? styles.textDanger : isWarning ? styles.textWarning : styles.textSafe,
          ]}
        >
          ${projection.finalProjectedLiquidity.toFixed(2)}{' '}
          <Text style={styles.currencyCode}>{projection.currency}</Text>
        </Text>

        <Text style={styles.mainFormula}>
          Activos + Ingresos - Deuda - Gastos Comprometidos
        </Text>
      </View>

      {/* Alerta de Déficit Temporal si existe */}
      {projection.isDeficitProjected && (
        <View style={styles.alertBanner}>
          <Ionicons name="warning-outline" size={18} color="#f59e0b" />
          <View style={styles.alertContent}>
            <Text style={styles.alertTitle}>Riesgo de liquidez en el horizonte</Text>
            <Text style={styles.alertDesc}>
              Se proyecta un punto bajo de ${projection.minimumLiquidity.toFixed(2)} en{' '}
              {projection.daysUntilDeficit ?? 0} días.
            </Text>
          </View>
        </View>
      )}

      {/* Componentes de la Fórmula */}
      <View style={styles.breakdownGrid}>
        {/* Activos Líquidos */}
        <View style={styles.breakdownItem}>
          <View style={styles.itemHeader}>
            <Ionicons name="wallet-outline" size={14} color="#38bdf8" />
            <Text style={styles.itemLabel}>Activos Líquidos</Text>
          </View>
          <Text style={[styles.itemAmount, styles.itemLiquid]}>
            ${projection.liquidAssets.toFixed(2)}
          </Text>
          <Text style={styles.itemNote}>Bancos y Efectivo</Text>
        </View>

        {/* Ingresos Esperados */}
        <View style={styles.breakdownItem}>
          <View style={styles.itemHeader}>
            <Ionicons name="arrow-down-circle-outline" size={14} color="#10b981" />
            <Text style={styles.itemLabel}>Ingresos Esp.</Text>
          </View>
          <Text style={[styles.itemAmount, styles.itemIncome]}>
            +${projection.expectedIncome.toFixed(2)}
          </Text>
          <Text style={styles.itemNote}>
            Fijos: ${Number((projection.expectedIncomeCommittedMinor / 100).toFixed(2))}
          </Text>
        </View>

        {/* Obligaciones de Crédito */}
        <View style={styles.breakdownItem}>
          <View style={styles.itemHeader}>
            <Ionicons name="card-outline" size={14} color="#f43f5e" />
            <Text style={styles.itemLabel}>Pasivo Crédito</Text>
          </View>
          <Text style={[styles.itemAmount, styles.itemCredit]}>
            -${projection.creditObligations.toFixed(2)}
          </Text>
          <Text style={styles.itemNote}>Tarjetas y Deuda</Text>
        </View>

        {/* Gastos Comprometidos */}
        <View style={styles.breakdownItem}>
          <View style={styles.itemHeader}>
            <Ionicons name="arrow-up-circle-outline" size={14} color="#f97316" />
            <Text style={styles.itemLabel}>Comprometidos</Text>
          </View>
          <Text style={[styles.itemAmount, styles.itemExpense]}>
            -${projection.committedExpenses.toFixed(2)}
          </Text>
          <Text style={styles.itemNote}>Renta, Préstamos, etc.</Text>
        </View>
      </View>

      {/* Desplegable de Trayectoria Temporal */}
      <TouchableOpacity
        style={styles.timelineToggle}
        onPress={() => setShowTimeline(!showTimeline)}
        activeOpacity={0.7}
      >
        <View style={styles.toggleLeft}>
          <Ionicons name="calendar-outline" size={16} color="#94a3b8" />
          <Text style={styles.toggleText}>
            Trayectoria de Eventos ({projection.occurrencesCount})
          </Text>
        </View>
        <Ionicons
          name={showTimeline ? 'chevron-up' : 'chevron-down'}
          size={16}
          color="#94a3b8"
        />
      </TouchableOpacity>

      {showTimeline && (
        <View style={styles.timelineContainer}>
          {activeTimelinePoints.length === 0 ? (
            <Text style={styles.emptyText}>
              No hay eventos ni obligaciones programadas en este horizonte.
            </Text>
          ) : (
            activeTimelinePoints.map((point: ProjectedLiquidityPoint) => (
              <View key={point.date} style={styles.timelineRow}>
                <View style={styles.timelineDateCol}>
                  <Text style={styles.pointDate}>{point.date.substring(5)}</Text>
                  <Text style={styles.pointDay}>Día +{point.dayIndex}</Text>
                </View>

                <View style={styles.timelineContentCol}>
                  <View style={styles.pointHeader}>
                    <Text style={styles.pointLiquidityLabel}>Saldo Proyectado:</Text>
                    <Text
                      style={[
                        styles.pointLiquidityValue,
                        point.projectedLiquidity < 0 && styles.textDanger,
                      ]}
                    >
                      ${point.projectedLiquidity.toFixed(2)}
                    </Text>
                  </View>

                  {point.events.map((evt: ProjectedLiquidityEvent, idx: number) => {
                    const isIncome = evt.direction === 'INCOME';
                    return (
                      <TouchableOpacity
                        key={`${evt.obligationId ?? 'event'}-${idx}`}
                        style={styles.eventItem}
                        onPress={() => onEventPress && onEventPress(evt)}
                        activeOpacity={0.7}
                        disabled={!onEventPress}
                      >
                        <Ionicons
                          name={isIncome ? 'arrow-down' : 'arrow-up'}
                          size={12}
                          color={isIncome ? '#10b981' : '#f97316'}
                        />
                        <Text style={styles.eventName} numberOfLines={1}>
                          {evt.name}
                        </Text>
                        <Text
                          style={[
                            styles.eventAmount,
                            isIncome ? styles.itemIncome : styles.itemExpense,
                          ]}
                        >
                          {isIncome ? '+' : '-'}${evt.amount.toFixed(2)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))
          )}
        </View>
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
  header: {
    marginBottom: 14,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
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
  horizonSelector: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  horizonPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  horizonPillActive: {
    backgroundColor: '#38bdf8',
    borderColor: '#38bdf8',
  },
  horizonPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
  },
  horizonPillTextActive: {
    color: '#0f172a',
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
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginVertical: 4,
  },
  currencyCode: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
  },
  mainFormula: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f59e0b18',
    borderColor: '#b45309',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 8,
    marginBottom: 12,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fbbf24',
  },
  alertDesc: {
    fontSize: 11,
    color: '#fde68a',
    marginTop: 1,
  },
  breakdownGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  breakdownItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  itemLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
  },
  itemAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  itemLiquid: {
    color: '#38bdf8',
  },
  itemIncome: {
    color: '#10b981',
  },
  itemCredit: {
    color: '#f43f5e',
  },
  itemExpense: {
    color: '#f97316',
  },
  itemNote: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  timelineToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toggleText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  timelineContainer: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 8,
  },
  emptyText: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 12,
  },
  timelineRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b22',
  },
  timelineDateCol: {
    width: 60,
    paddingRight: 8,
  },
  pointDate: {
    fontSize: 11,
    fontWeight: '700',
    color: '#cbd5e1',
  },
  pointDay: {
    fontSize: 9,
    color: '#64748b',
  },
  timelineContentCol: {
    flex: 1,
  },
  pointHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  pointLiquidityLabel: {
    fontSize: 11,
    color: '#94a3b8',
  },
  pointLiquidityValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#38bdf8',
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0b1120',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginTop: 3,
    gap: 4,
  },
  eventName: {
    fontSize: 11,
    color: '#e2e8f0',
    flex: 1,
  },
  eventAmount: {
    fontSize: 11,
    fontWeight: '600',
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
});
