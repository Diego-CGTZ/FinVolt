import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../application/state/AuthContext';
import { useAccounts } from '../../application/state/AccountsContext';
import { useTransactions } from '../../application/state/TransactionsContext';
import {
  calculateAggregateBalances,
  calculateLiquidityMetrics,
} from '../../domain/services/BalanceCalculatorService';
import { ACCOUNT_TYPE_CONFIG } from './AccountsScreen';

interface HomeScreenProps {
  onNavigateTab?: (tab: 'ACCOUNTS' | 'TRANSACTIONS') => void;
}

/**
 * HomeScreen (Dashboard US-015 / US-016)
 *
 * Muestra el panel financiero principal con:
 * - Distinción estricta entre Balance Contable, Liquidez Real y Liquidez Proyectada.
 * - Desglose de liquidez líquida (Efectivo, Débito, Ahorro, Billeteras).
 * - Exclusión estricta de tarjetas como liquidez positiva y de transferencias como gastos.
 * - Balances actuales individuales por cuenta (actualizados automáticamente con transacciones).
 * - Cierre de sesión seguro (US-004).
 */
export function HomeScreen({ onNavigateTab }: HomeScreenProps) {
  const { user, signOut } = useAuth();
  const { accounts, isLoading: accountsLoading } = useAccounts();
  const { transactions, isLoading: txLoading } = useTransactions();

  const aggregates = useMemo(
    () => calculateAggregateBalances(accounts, transactions),
    [accounts, transactions],
  );

  const liquidity = useMemo(
    () => calculateLiquidityMetrics(accounts, transactions),
    [accounts, transactions],
  );

  async function handleSignOut() {
    Alert.alert('Cerrar sesión', '¿Estás seguro que deseas salir de FinVolt?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Cerrar sesión',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
          } catch {
            Alert.alert('Error', 'No se pudo cerrar sesión. Intenta de nuevo.');
          }
        },
      },
    ]);
  }

  const isNetWorthPositive = aggregates.totalNetWorth >= 0;

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Top Header con perfil y cerrar sesión */}
        <View style={styles.topHeader}>
          <View style={styles.brandRow}>
            <View style={styles.logoBadge}>
              <Ionicons name="flash" size={20} color="#6366f1" />
            </View>
            <View>
              <Text style={styles.brandName}>FinVolt</Text>
              <Text style={styles.userEmail} numberOfLines={1}>
                {user?.email || 'Usuario'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            id="home-signout"
            style={styles.signOutButton}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={16} color="#94a3b8" style={{ marginRight: 4 }} />
            <Text style={styles.signOutText}>Salir</Text>
          </TouchableOpacity>
        </View>

        {(accountsLoading || txLoading) && accounts.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={styles.loadingText}>Calculando balances...</Text>
          </View>
        ) : (
          <>
            {/* Tarjeta Hero: Patrimonio Neto */}
            <View style={styles.netWorthCard}>
              <View style={styles.netWorthTop}>
                <View>
                  <Text style={styles.netWorthLabel}>Patrimonio Neto Total</Text>
                  <Text
                    style={[
                      styles.netWorthAmount,
                      !isNetWorthPositive && styles.netWorthAmountNegative,
                    ]}
                  >
                    {!isNetWorthPositive ? '-' : ''}${Math.abs(aggregates.totalNetWorth).toFixed(2)}
                  </Text>
                  <Text style={styles.netWorthCurrency}>Pesos Mexicanos (MXN)</Text>
                </View>
                <View
                  style={[
                    styles.healthBadge,
                    isNetWorthPositive ? styles.healthBadgePositive : styles.healthBadgeWarning,
                  ]}
                >
                  <Ionicons
                    name={isNetWorthPositive ? 'shield-checkmark-outline' : 'alert-circle-outline'}
                    size={14}
                    color={isNetWorthPositive ? '#10b981' : '#f59e0b'}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.healthBadgeText,
                      { color: isNetWorthPositive ? '#10b981' : '#f59e0b' },
                    ]}
                  >
                    {isNetWorthPositive ? 'Positivo' : 'En Déficit'}
                  </Text>
                </View>
              </View>

              <View style={styles.netWorthDivider} />

              <View style={styles.netWorthFooter}>
                <View style={styles.summaryMetricItem}>
                  <Text style={styles.summaryMetricLabel}>Liquidez Real</Text>
                  <Text style={styles.summaryMetricValue}>
                    ${liquidity.realLiquidity.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.summaryMetricDivider} />
                <View style={styles.summaryMetricItem}>
                  <Text style={styles.summaryMetricLabel}>Proyectada</Text>
                  <Text
                    style={[
                      styles.summaryMetricValue,
                      liquidity.projectedLiquidity < 0 && styles.debtText,
                    ]}
                  >
                    ${liquidity.projectedLiquidity.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.summaryMetricDivider} />
                <View style={styles.summaryMetricItem}>
                  <Text style={styles.summaryMetricLabel}>Deuda Tarjetas</Text>
                  <Text style={[styles.summaryMetricValue, liquidity.creditCardDebt > 0 && styles.debtText]}>
                    {liquidity.creditCardDebt > 0
                      ? `-$${liquidity.creditCardDebt.toFixed(2)}`
                      : '$0.00'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Fila de Tarjetas de Liquidez Real vs Proyectada (US-016) */}
            <View style={styles.cardsRow}>
              {/* Liquidez Real */}
              <View style={styles.metricCard}>
                <View style={styles.metricCardHeader}>
                  <View style={[styles.metricIconBox, { backgroundColor: '#10b98122' }]}>
                    <Ionicons name="wallet-outline" size={18} color="#10b981" />
                  </View>
                  <Text style={styles.metricCardTag}>Disponible</Text>
                </View>
                <Text style={styles.metricCardLabel}>Liquidez Real</Text>
                <Text style={styles.metricCardAmount}>
                  ${liquidity.realLiquidity.toFixed(2)}
                </Text>
                <Text style={styles.metricCardSub}>Efectivo + Bancos + Ahorros</Text>
              </View>

              {/* Liquidez Proyectada */}
              <View style={styles.metricCard}>
                <View style={styles.metricCardHeader}>
                  <View
                    style={[
                      styles.metricIconBox,
                      {
                        backgroundColor:
                          liquidity.projectedLiquidity >= 0 ? '#38bdf822' : '#ef444422',
                      },
                    ]}
                  >
                    <Ionicons
                      name="calculator-outline"
                      size={18}
                      color={liquidity.projectedLiquidity >= 0 ? '#38bdf8' : '#ef4444'}
                    />
                  </View>
                  <Text
                    style={[
                      styles.metricCardTag,
                      liquidity.projectedLiquidity >= 0 ? styles.tagClear : styles.tagDebt,
                    ]}
                  >
                    Proyectada
                  </Text>
                </View>
                <Text style={styles.metricCardLabel}>Liquidez Proyectada</Text>
                <Text
                  style={[
                    styles.metricCardAmount,
                    liquidity.projectedLiquidity < 0 && styles.debtAmountText,
                  ]}
                >
                  ${liquidity.projectedLiquidity.toFixed(2)}
                </Text>
                <Text style={styles.metricCardSub}>Tras saldar deudas de crédito</Text>
              </View>
            </View>

            {/* Flujo Real del Periodo (US-016: Transferencias no son gastos) */}
            <View style={styles.cashFlowCard}>
              <View style={styles.cashFlowHeader}>
                <Ionicons name="swap-vertical-outline" size={16} color="#6366f1" />
                <Text style={styles.cashFlowTitle}>Flujo Real del Periodo</Text>
                <Text style={styles.cashFlowSubtitle}>(Sin transferencias)</Text>
              </View>
              <View style={styles.cashFlowRow}>
                <View style={styles.cashFlowItem}>
                  <View style={styles.cashFlowItemHeader}>
                    <Ionicons name="arrow-up-circle" size={14} color="#10b981" />
                    <Text style={styles.cashFlowItemLabel}>Ingresos</Text>
                  </View>
                  <Text style={styles.incomeAmount}>+${liquidity.actualIncomes.toFixed(2)}</Text>
                </View>
                <View style={styles.cashFlowDivider} />
                <View style={styles.cashFlowItem}>
                  <View style={styles.cashFlowItemHeader}>
                    <Ionicons name="arrow-down-circle" size={14} color="#ef4444" />
                    <Text style={styles.cashFlowItemLabel}>Gastos</Text>
                  </View>
                  <Text style={styles.expenseAmount}>-${liquidity.actualExpenses.toFixed(2)}</Text>
                </View>
              </View>
            </View>

            {/* Desglose de Canastas de Liquidez Líquida */}
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Canastas de Liquidez Líquida</Text>
              <View style={styles.breakdownGrid}>
                <View style={styles.breakdownItem}>
                  <Ionicons name="business-outline" size={16} color="#6366f1" />
                  <Text style={styles.breakdownName}>Cuentas Bancarias / Débito</Text>
                  <Text style={styles.breakdownValue}>
                    ${liquidity.liquidAccountsBreakdown.checking.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.breakdownItem}>
                  <Ionicons name="cash-outline" size={16} color="#f59e0b" />
                  <Text style={styles.breakdownName}>Efectivo en Mano</Text>
                  <Text style={styles.breakdownValue}>
                    ${liquidity.liquidAccountsBreakdown.cash.toFixed(2)}
                  </Text>
                </View>
                {liquidity.liquidAccountsBreakdown.savings > 0 && (
                  <View style={styles.breakdownItem}>
                    <Ionicons name="trending-up-outline" size={16} color="#10b981" />
                    <Text style={styles.breakdownName}>Ahorros / Inversión</Text>
                    <Text style={styles.breakdownValue}>
                      ${liquidity.liquidAccountsBreakdown.savings.toFixed(2)}
                    </Text>
                  </View>
                )}
                {liquidity.liquidAccountsBreakdown.digitalWallets > 0 && (
                  <View style={styles.breakdownItem}>
                    <Ionicons name="phone-portrait-outline" size={16} color="#a855f7" />
                    <Text style={styles.breakdownName}>Billeteras Digitales</Text>
                    <Text style={styles.breakdownValue}>
                      ${liquidity.liquidAccountsBreakdown.digitalWallets.toFixed(2)}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Sección: Balances por Cuenta */}
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Balances por Cuenta</Text>
                {onNavigateTab && (
                  <TouchableOpacity
                    onPress={() => onNavigateTab('ACCOUNTS')}
                    style={styles.seeMoreButton}
                  >
                    <Text style={styles.seeMoreText}>Ver todas</Text>
                    <Ionicons name="chevron-forward" size={14} color="#6366f1" />
                  </TouchableOpacity>
                )}
              </View>

              {accounts.length === 0 ? (
                <View style={styles.emptyAccountsCard}>
                  <Ionicons name="wallet-outline" size={32} color="#64748b" />
                  <Text style={styles.emptyAccountsTitle}>No hay cuentas registradas</Text>
                  <Text style={styles.emptyAccountsSub}>
                    Agrega cuentas para comenzar a visualizar tus balances.
                  </Text>
                  {onNavigateTab && (
                    <TouchableOpacity
                      style={styles.emptyAddButton}
                      onPress={() => onNavigateTab('ACCOUNTS')}
                    >
                      <Ionicons name="add" size={16} color="#fff" style={{ marginRight: 4 }} />
                      <Text style={styles.emptyAddButtonText}>Agregar Cuenta</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View style={styles.accountsList}>
                  {accounts.map((acc) => {
                    const isCredit = acc.type === 'CREDIT_CARD';
                    const config = ACCOUNT_TYPE_CONFIG[acc.type] || ACCOUNT_TYPE_CONFIG.OTHER;
                    const bal = aggregates.balancesByAccount[acc.id];
                    const currentBal = bal ? bal.currentBalance : acc.initialBalance;
                    const isNeg = currentBal < 0;
                    const netDelta = bal ? bal.netChange : 0;

                    return (
                      <View key={acc.id} style={styles.accountRowCard}>
                        <View style={[styles.accountIconBox, { backgroundColor: `${config.color}22` }]}>
                          <Ionicons name={config.iconName} size={20} color={config.color} />
                        </View>
                        <View style={styles.accountTextCol}>
                          <Text style={styles.accountRowName} numberOfLines={1}>
                            {acc.name}
                          </Text>
                          <Text style={styles.accountRowSub}>{config.label}</Text>
                        </View>
                        <View style={styles.accountBalanceCol}>
                          <Text
                            style={[
                              styles.accountRowBalance,
                              isCredit && !isNeg && styles.creditPositive,
                              isNeg && styles.creditDebtText,
                            ]}
                          >
                            {isNeg ? '-' : ''}${Math.abs(currentBal).toFixed(2)} {acc.currency}
                          </Text>
                          {netDelta !== 0 ? (
                            <View style={styles.rowDelta}>
                              <Ionicons
                                name={netDelta > 0 ? 'arrow-up' : 'arrow-down'}
                                size={11}
                                color={netDelta > 0 ? '#10b981' : '#ef4444'}
                              />
                              <Text
                                style={[
                                  styles.rowDeltaText,
                                  { color: netDelta > 0 ? '#10b981' : '#ef4444' },
                                ]}
                              >
                                {netDelta > 0 ? '+' : ''}${netDelta.toFixed(2)}
                              </Text>
                            </View>
                          ) : (
                            <Text style={styles.rowStaticSub}>Sin variaciones</Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Accesos directos rápidos */}
            {onNavigateTab && (
              <View style={styles.quickNavRow}>
                <TouchableOpacity
                  style={styles.quickNavCard}
                  onPress={() => onNavigateTab('ACCOUNTS')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="wallet-outline" size={20} color="#6366f1" />
                  <Text style={styles.quickNavText}>Gestionar Cuentas</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickNavCard}
                  onPress={() => onNavigateTab('TRANSACTIONS')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="receipt-outline" size={20} color="#10b981" />
                  <Text style={styles.quickNavText}>Ver Movimientos</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 16,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    marginBottom: 4,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  brandName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: -0.5,
  },
  userEmail: {
    fontSize: 12,
    color: '#64748b',
    maxWidth: 180,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#1e293b',
  },
  signOutText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  // Hero: Patrimonio Neto
  netWorthCard: {
    backgroundColor: '#1e293b',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  netWorthTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  netWorthLabel: {
    fontSize: 12,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
  },
  netWorthAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: '#f8fafc',
    marginTop: 4,
    letterSpacing: -0.5,
  },
  netWorthAmountNegative: {
    color: '#ef4444',
  },
  netWorthCurrency: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500',
  },
  healthBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  healthBadgePositive: {
    backgroundColor: '#10b98115',
    borderColor: '#10b98144',
  },
  healthBadgeWarning: {
    backgroundColor: '#f59e0b15',
    borderColor: '#f59e0b44',
  },
  healthBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  netWorthDivider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 16,
  },
  netWorthFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryMetricItem: {
    flex: 1,
  },
  summaryMetricLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryMetricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f8fafc',
    marginTop: 2,
  },
  debtText: {
    color: '#ef4444',
  },
  summaryMetricDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#334155',
    marginHorizontal: 16,
  },
  // Cards Row
  cardsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  metricCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  metricIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricCardTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  tagDebt: {
    color: '#ef4444',
  },
  tagClear: {
    color: '#10b981',
  },
  metricCardLabel: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  metricCardAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: '#f8fafc',
    marginTop: 4,
  },
  debtAmountText: {
    color: '#ef4444',
  },
  metricCardSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  // Cash Flow Card (US-016)
  cashFlowCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 12,
  },
  cashFlowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cashFlowTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f8fafc',
  },
  cashFlowSubtitle: {
    fontSize: 11,
    color: '#64748b',
  },
  cashFlowRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cashFlowItem: {
    flex: 1,
  },
  cashFlowItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  cashFlowItemLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  cashFlowDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#334155',
    marginHorizontal: 16,
  },
  incomeAmount: {
    fontSize: 17,
    fontWeight: '800',
    color: '#10b981',
  },
  expenseAmount: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ef4444',
  },
  // Section Breakdown
  sectionContainer: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
    letterSpacing: -0.3,
  },
  seeMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  seeMoreText: {
    fontSize: 12,
    color: '#6366f1',
    fontWeight: '600',
  },
  breakdownGrid: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 10,
  },
  breakdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  breakdownName: {
    flex: 1,
    marginLeft: 10,
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
  },
  breakdownValue: {
    fontSize: 13,
    color: '#f8fafc',
    fontWeight: '700',
  },
  // Accounts List
  accountsList: {
    gap: 10,
  },
  accountRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  accountIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  accountTextCol: {
    flex: 1,
  },
  accountRowName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
  },
  accountRowSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  accountBalanceCol: {
    alignItems: 'flex-end',
  },
  accountRowBalance: {
    fontSize: 15,
    fontWeight: '800',
    color: '#10b981',
  },
  creditPositive: {
    color: '#38bdf8',
  },
  creditDebtText: {
    color: '#ef4444',
  },
  rowDelta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  rowDeltaText: {
    fontSize: 10,
    fontWeight: '600',
  },
  rowStaticSub: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  emptyAccountsCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  emptyAccountsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
  },
  emptyAccountsSub: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    maxWidth: 240,
  },
  emptyAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  emptyAddButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  // Quick Nav
  quickNavRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  quickNavCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  quickNavText: {
    fontSize: 13,
    color: '#f8fafc',
    fontWeight: '600',
  },
});
