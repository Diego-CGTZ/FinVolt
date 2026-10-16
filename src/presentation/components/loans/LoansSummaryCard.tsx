/**
 * LoansSummaryCard — Tarjeta de Resumen Financiero de Préstamos y Deudas (US-049)
 *
 * Muestra el balance consolidado entre cuentas por cobrar (Lent) y cuentas por pagar (Borrowed),
 * con desglose de montos pendientes y conteos de préstamos activos.
 * NUNCA utiliza emojis; usa exclusivamente Ionicons y estilos limpios.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LoansSummary } from '../../../domain/models/Loan';

interface LoansSummaryCardProps {
  summary: LoansSummary;
}

export const LoansSummaryCard: React.FC<LoansSummaryCardProps> = ({ summary }) => {
  const netMinor = summary.outstandingLentMinor - summary.outstandingBorrowedMinor;
  const netPosition = Number((netMinor / 100).toFixed(2));
  const isPositive = netPosition >= 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Ionicons name="people-outline" size={18} color="#818cf8" style={styles.titleIcon} />
          <Text style={styles.title}>Préstamos y Deudas</Text>
        </View>
        <View style={[styles.netBadge, { backgroundColor: isPositive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }]}>
          <Text style={[styles.netBadgeText, { color: isPositive ? '#10b981' : '#f87171' }]}>
            Posición: {isPositive ? '+' : '-'}${Math.abs(netPosition).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </Text>
        </View>
      </View>

      <View style={styles.metricsGrid}>
        {/* Columna Por Cobrar (Lent) */}
        <View style={styles.metricColumn}>
          <View style={styles.columnHeader}>
            <Ionicons name="arrow-up-circle" size={14} color="#10b981" style={styles.colIcon} />
            <Text style={styles.columnLabel}>Por Cobrar</Text>
          </View>
          <Text style={styles.lentAmount}>
            ${summary.outstandingLent.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </Text>
          <Text style={styles.subtext}>
            {summary.activeLentCount} {summary.activeLentCount === 1 ? 'préstamo activo' : 'préstamos activos'}
          </Text>
        </View>

        <View style={styles.divider} />

        {/* Columna Por Pagar (Borrowed) */}
        <View style={styles.metricColumn}>
          <View style={styles.columnHeader}>
            <Ionicons name="arrow-down-circle" size={14} color="#f87171" style={styles.colIcon} />
            <Text style={styles.columnLabel}>Por Pagar</Text>
          </View>
          <Text style={styles.borrowedAmount}>
            ${summary.outstandingBorrowed.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </Text>
          <Text style={styles.subtext}>
            {summary.activeBorrowedCount} {summary.activeBorrowedCount === 1 ? 'deuda activa' : 'deudas activas'}
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Ionicons name="checkmark-done-circle-outline" size={14} color="#94a3b8" style={styles.footerIcon} />
        <Text style={styles.footerText}>
          Total liquidados históricamente: {summary.paidLoansCount}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleIcon: {
    marginRight: 8,
  },
  title: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  netBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  netBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metricsGrid: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  metricColumn: {
    flex: 1,
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  colIcon: {
    marginRight: 4,
  },
  columnLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  lentAmount: {
    color: '#10b981',
    fontSize: 18,
    fontWeight: '800',
  },
  borrowedAmount: {
    color: '#f87171',
    fontSize: 18,
    fontWeight: '800',
  },
  subtext: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  divider: {
    width: 1,
    height: '80%',
    backgroundColor: '#334155',
    marginHorizontal: 12,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  footerIcon: {
    marginRight: 6,
  },
  footerText: {
    color: '#94a3b8',
    fontSize: 12,
  },
});
