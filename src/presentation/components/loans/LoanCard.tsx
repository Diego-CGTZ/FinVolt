/**
 * LoanCard — Componente Visual de Préstamo / Deuda (US-049)
 *
 * Muestra los detalles de un préstamo (otorgado o recibido):
 * - Tipo (Por cobrar / Por pagar)
 * - Contacto y descripción
 * - Monto original y saldo pendiente
 * - Barra de progreso de amortización / liquidación
 * - Estado (Activo / Liquidado)
 * - NUNCA usa emojis; utiliza Ionicons de @expo/vector-icons.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Loan } from '../../../domain/models/Loan';
import type { Contact } from '../../../domain/models/Contact';

interface LoanCardProps {
  loan: Loan;
  contact?: Contact | null;
  onPress?: () => void;
  onRecordPayment?: () => void;
}

export const LoanCard: React.FC<LoanCardProps> = ({
  loan,
  contact,
  onPress,
  onRecordPayment,
}) => {
  const isLent = loan.type === 'LENT';
  const isPaid = loan.status === 'PAID';
  const isCancelled = loan.status === 'CANCELLED';

  const percentagePaid =
    loan.amountMinor > 0
      ? Math.min(100, Math.round((loan.paidAmountMinor / loan.amountMinor) * 100))
      : 0;

  const typeColor = isLent ? '#10b981' : '#f59e0b';
  const statusColor = isPaid ? '#10b981' : isCancelled ? '#64748b' : '#38bdf8';

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.card, isPaid && styles.cardPaid]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.header}>
        <View style={styles.typeBadgeContainer}>
          <View
            style={[
              styles.iconWrapper,
              { backgroundColor: isLent ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)' },
            ]}
          >
            <Ionicons
              name={isLent ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline'}
              size={18}
              color={typeColor}
            />
          </View>
          <View style={styles.headerTitles}>
            <Text style={styles.contactName} numberOfLines={1}>
              {contact?.name || 'Contacto no asignado'}
            </Text>
            <Text style={styles.description} numberOfLines={1}>
              {loan.description}
            </Text>
          </View>
        </View>

        <View style={[styles.statusBadge, { borderColor: statusColor }]}>
          <Ionicons
            name={isPaid ? 'checkmark-circle' : isCancelled ? 'close-circle' : 'time-outline'}
            size={12}
            color={statusColor}
            style={styles.statusIcon}
          />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {isPaid ? 'Liquidado' : isCancelled ? 'Cancelado' : isLent ? 'Por cobrar' : 'Por pagar'}
          </Text>
        </View>
      </View>

      <View style={styles.amountRow}>
        <View>
          <Text style={styles.amountLabel}>Saldo pendiente</Text>
          <Text style={[styles.outstandingAmount, { color: isLent ? '#10b981' : '#f87171' }]}>
            ${loan.outstandingBalance.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </Text>
        </View>
        <View style={styles.principalContainer}>
          <Text style={styles.amountLabel}>Monto total</Text>
          <Text style={styles.principalAmount}>
            ${loan.amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })} {loan.currency}
          </Text>
        </View>
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBarBackground}>
          <View
            style={[
              styles.progressBarFill,
              {
                width: `${percentagePaid}%`,
                backgroundColor: isPaid ? '#10b981' : '#6366f1',
              },
            ]}
          />
        </View>
        <View style={styles.progressLabels}>
          <Text style={styles.progressText}>Pagado: {percentagePaid}%</Text>
          <Text style={styles.progressText}>
            Abonado: ${loan.paidAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </Text>
        </View>
      </View>

      {!isPaid && !isCancelled && onRecordPayment && (
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onRecordPayment}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle-outline" size={16} color="#6366f1" style={styles.actionIcon} />
          <Text style={styles.actionButtonText}>Registrar Abono</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginVertical: 6,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardPaid: {
    opacity: 0.85,
    borderColor: '#1e3a47',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconWrapper: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerTitles: {
    flex: 1,
  },
  contactName: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  description: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  statusIcon: {
    marginRight: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  amountLabel: {
    color: '#64748b',
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  outstandingAmount: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  principalContainer: {
    alignItems: 'flex-end',
  },
  principalAmount: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  progressContainer: {
    marginTop: 4,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: '#0f172a',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  progressText: {
    color: '#94a3b8',
    fontSize: 11,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  actionIcon: {
    marginRight: 6,
  },
  actionButtonText: {
    color: '#818cf8',
    fontSize: 13,
    fontWeight: '600',
  },
});
