import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAccounts } from '../../application/state/AccountsContext';
import { useTransactions } from '../../application/state/TransactionsContext';
import { toMinorUnits, toDecimal, TransactionType } from '../../domain/models/Transaction';

export const AddExpenseScreen = () => {
  const { accounts } = useAccounts();
  const { transactions, loadTransactions, createTransaction, updateTransaction, isLoading } =
    useTransactions();

  const [isModalVisible, setIsModalVisible] = useState(false);

  // Form state
  const [movementType, setMovementType] = useState<TransactionType>('EXPENSE');
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Efectivos para selección por defecto
  const effectiveSourceAccountId = sourceAccountId || accounts[0]?.id || '';
  const effectiveDestinationAccountId =
    destinationAccountId || accounts.find((a) => a.id !== effectiveSourceAccountId)?.id || '';

  const openModal = (initialType: TransactionType = 'EXPENSE') => {
    setMovementType(initialType);
    if (!sourceAccountId && accounts.length > 0) setSourceAccountId(accounts[0].id);
    if (!destinationAccountId && accounts.length > 1) {
      const other = accounts.find((a) => a.id !== accounts[0].id);
      if (other) setDestinationAccountId(other.id);
    }
    setIsModalVisible(true);
  };

  // Cargar transacciones al montar la pantalla
  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const handleCreate = async () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Error', 'Ingresa un monto válido');
      return;
    }

    const amountMinor = toMinorUnits(parsedAmount);

    if (movementType === 'EXPENSE') {
      if (!effectiveSourceAccountId) {
        Alert.alert('Error', 'Selecciona una cuenta de origen');
        return;
      }
      const selectedAccount = accounts.find((a) => a.id === effectiveSourceAccountId);
      if (!selectedAccount) return;

      try {
        setIsSubmitting(true);
        await createTransaction({
          accountId: effectiveSourceAccountId,
          type: 'EXPENSE',
          amountMinor,
          currency: selectedAccount.currency,
          occurredAt: new Date(),
          merchantRaw: merchant.trim() || undefined,
          description: description.trim() || undefined,
          source: 'MANUAL',
        });
        finishSuccess('Gasto registrado correctamente');
      } catch (err: any) {
        handleError(err);
      } finally {
        setIsSubmitting(false);
      }
    } else if (movementType === 'INCOME') {
      const targetAccountId = effectiveSourceAccountId;
      if (!targetAccountId) {
        Alert.alert('Error', 'Selecciona la cuenta que recibe el dinero');
        return;
      }
      const selectedAccount = accounts.find((a) => a.id === targetAccountId);
      if (!selectedAccount) return;

      try {
        setIsSubmitting(true);
        await createTransaction({
          accountId: targetAccountId,
          type: 'INCOME',
          amountMinor,
          currency: selectedAccount.currency,
          occurredAt: new Date(),
          merchantRaw: merchant.trim() || undefined, // Pagador o fuente de ingreso
          description: description.trim() || undefined,
          source: 'MANUAL',
        });
        finishSuccess('Ingreso registrado correctamente');
      } catch (err: any) {
        handleError(err);
      } finally {
        setIsSubmitting(false);
      }
    } else if (movementType === 'TRANSFER') {
      if (!effectiveSourceAccountId) {
        Alert.alert('Error', 'Selecciona la cuenta de origen');
        return;
      }
      if (!effectiveDestinationAccountId) {
        Alert.alert('Error', 'Selecciona la cuenta de destino');
        return;
      }
      if (effectiveSourceAccountId === effectiveDestinationAccountId) {
        Alert.alert('Error', 'La cuenta de origen y destino deben ser diferentes');
        return;
      }

      const sourceAcc = accounts.find((a) => a.id === effectiveSourceAccountId);
      const destAcc = accounts.find((a) => a.id === effectiveDestinationAccountId);
      if (!sourceAcc || !destAcc) return;

      try {
        setIsSubmitting(true);

        // Crear la pata de salida (origen)
        const outbound = await createTransaction({
          accountId: effectiveSourceAccountId,
          type: 'TRANSFER',
          amountMinor,
          currency: sourceAcc.currency,
          occurredAt: new Date(),
          description: description.trim() || `Transferencia hacia ${destAcc.name}`,
          source: 'MANUAL',
        });

        // Crear la pata de entrada (destino) vinculada
        const inbound = await createTransaction({
          accountId: effectiveDestinationAccountId,
          type: 'TRANSFER',
          amountMinor,
          currency: destAcc.currency,
          occurredAt: new Date(),
          description: description.trim() || `Transferencia desde ${sourceAcc.name}`,
          linkedTransactionId: outbound.id,
          source: 'MANUAL',
        });

        // Vincular pata de salida con la de entrada
        await updateTransaction(outbound.id, { linkedTransactionId: inbound.id });

        finishSuccess('Transferencia registrada correctamente');
      } catch (err: any) {
        handleError(err);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const finishSuccess = (msg: string) => {
    Alert.alert('Éxito', msg);
    setIsModalVisible(false);
    setAmount('');
    setMerchant('');
    setDescription('');
  };

  const handleError = (err: any) => {
    console.error('Error al registrar movimiento:', err);
    Alert.alert('Error al registrar movimiento', err?.message || JSON.stringify(err));
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Movimientos</Text>
        <TouchableOpacity style={styles.addButton} onPress={() => openModal('EXPENSE')}>
          <Text style={styles.addButtonText}>+ Nuevo Movimiento</Text>
        </TouchableOpacity>
      </View>

      {/* Lista de movimientos */}
      {isLoading && transactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : transactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No hay movimientos registrados.</Text>
          <Text style={styles.emptySubtext}>
            Toca en &quot;+ Nuevo Movimiento&quot; para registrar un gasto, ingreso o transferencia.
          </Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const acc = accounts.find((a) => a.id === item.accountId);
            const isExpense = item.type === 'EXPENSE';
            const isIncome = item.type === 'INCOME';
            const isTransfer = item.type === 'TRANSFER';

            const dateStr = new Date(item.occurredAt).toLocaleDateString('es-MX', {
              day: 'numeric',
              month: 'short',
            });

            return (
              <View style={styles.txCard}>
                <View style={styles.txLeft}>
                  <View style={styles.txTypeRow}>
                    <View
                      style={[
                        styles.badge,
                        isExpense && styles.badgeExpense,
                        isIncome && styles.badgeIncome,
                        isTransfer && styles.badgeTransfer,
                      ]}
                    >
                      <Text style={styles.badgeText}>
                        {isExpense ? 'GASTO' : isIncome ? 'INGRESO' : 'TRANSFER'}
                      </Text>
                    </View>
                    <Text style={styles.txMerchant}>
                      {item.merchant || item.merchantRaw || item.description || 'Movimiento'}
                    </Text>
                  </View>
                  <Text style={styles.txSub}>
                    {acc?.name || 'Cuenta'} • {dateStr}
                    {item.description && item.merchant ? ` • ${item.description}` : ''}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.txAmount,
                    isExpense && styles.amountExpense,
                    isIncome && styles.amountIncome,
                    isTransfer && styles.amountTransfer,
                  ]}
                >
                  {isExpense ? '-' : isIncome ? '+' : '⇄'} ${toDecimal(item.amountMinor).toFixed(2)}{' '}
                  {item.currency}
                </Text>
              </View>
            );
          }}
        />
      )}

      {/* Modal unificado de registro */}
      <Modal visible={isModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Registrar Movimiento</Text>

              {/* Selector de Tipo de Movimiento */}
              <View style={styles.typeSelectorRow}>
                <TouchableOpacity
                  style={[styles.typeButton, movementType === 'EXPENSE' && styles.typeButtonExpenseActive]}
                  onPress={() => setMovementType('EXPENSE')}
                >
                  <Text
                    style={[
                      styles.typeButtonText,
                      movementType === 'EXPENSE' && styles.typeButtonTextActive,
                    ]}
                  >
                    Gasto
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.typeButton, movementType === 'INCOME' && styles.typeButtonIncomeActive]}
                  onPress={() => setMovementType('INCOME')}
                >
                  <Text
                    style={[
                      styles.typeButtonText,
                      movementType === 'INCOME' && styles.typeButtonTextActive,
                    ]}
                  >
                    Ingreso
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    movementType === 'TRANSFER' && styles.typeButtonTransferActive,
                  ]}
                  onPress={() => setMovementType('TRANSFER')}
                >
                  <Text
                    style={[
                      styles.typeButtonText,
                      movementType === 'TRANSFER' && styles.typeButtonTextActive,
                    ]}
                  >
                    Transferencia
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Cuenta Origen / Destino según tipo */}
              <Text style={styles.label}>
                {movementType === 'EXPENSE'
                  ? 'Cuenta de la que sale el dinero'
                  : movementType === 'INCOME'
                  ? 'Cuenta que recibe el dinero'
                  : 'Cuenta origen (sale dinero)'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorContainer}>
                {accounts.map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[
                      styles.chipButton,
                      effectiveSourceAccountId === acc.id && styles.chipButtonActive,
                    ]}
                    onPress={() => setSourceAccountId(acc.id)}
                  >
                    <Text
                      style={[
                        styles.chipButtonText,
                        effectiveSourceAccountId === acc.id && styles.chipButtonTextActive,
                      ]}
                    >
                      {acc.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Cuenta destino exclusiva para Transferencias */}
              {movementType === 'TRANSFER' && (
                <>
                  <Text style={styles.label}>Cuenta destino (entra dinero)</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.selectorContainer}
                  >
                    {accounts
                      .filter((acc) => acc.id !== effectiveSourceAccountId)
                      .map((acc) => (
                        <TouchableOpacity
                          key={acc.id}
                          style={[
                            styles.chipButton,
                            effectiveDestinationAccountId === acc.id && styles.chipButtonTransferActive,
                          ]}
                          onPress={() => setDestinationAccountId(acc.id)}
                        >
                          <Text
                            style={[
                              styles.chipButtonText,
                              effectiveDestinationAccountId === acc.id && styles.chipButtonTextActive,
                            ]}
                          >
                            {acc.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                  </ScrollView>
                </>
              )}

              {/* Monto */}
              <Text style={styles.label}>Monto</Text>
              <TextInput
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor="#94a3b8"
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
                autoFocus
              />

              {/* Comercio / Pagador */}
              {movementType !== 'TRANSFER' && (
                <>
                  <Text style={styles.label}>
                    {movementType === 'EXPENSE' ? 'Comercio / Lugar (Opcional)' : 'Pagador / Fuente (Opcional)'}
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder={movementType === 'EXPENSE' ? 'Ej. Walmart, Oxxo, Gasolinera' : 'Ej. Nómina, Cliente, Devolución'}
                    placeholderTextColor="#94a3b8"
                    value={merchant}
                    onChangeText={setMerchant}
                  />
                </>
              )}

              {/* Descripción */}
              <Text style={styles.label}>Descripción o Nota (Opcional)</Text>
              <TextInput
                style={styles.input}
                placeholder={
                  movementType === 'EXPENSE'
                    ? 'Ej. Compras de la semana'
                    : movementType === 'INCOME'
                    ? 'Ej. Pago quincenal'
                    : 'Ej. Pasar a cuenta de ahorro'
                }
                placeholderTextColor="#94a3b8"
                value={description}
                onChangeText={setDescription}
              />

              {/* Acciones */}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setIsModalVisible(false)}
                  disabled={isSubmitting}
                >
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    movementType === 'EXPENSE' && styles.saveButtonExpense,
                    movementType === 'INCOME' && styles.saveButtonIncome,
                    movementType === 'TRANSFER' && styles.saveButtonTransfer,
                  ]}
                  onPress={handleCreate}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>
                      {movementType === 'EXPENSE'
                        ? 'Guardar Gasto'
                        : movementType === 'INCOME'
                        ? 'Guardar Ingreso'
                        : 'Transferir'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    backgroundColor: '#1e293b',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  addButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 18,
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  txCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  txLeft: {
    flex: 1,
    marginRight: 12,
  },
  txTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#334155',
  },
  badgeExpense: {
    backgroundColor: '#ef444422',
  },
  badgeIncome: {
    backgroundColor: '#10b98122',
  },
  badgeTransfer: {
    backgroundColor: '#6366f122',
  },
  badgeText: {
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: 'bold',
  },
  txMerchant: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
  },
  txSub: {
    color: '#94a3b8',
    fontSize: 13,
  },
  txAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  amountExpense: {
    color: '#ef4444',
  },
  amountIncome: {
    color: '#10b981',
  },
  amountTransfer: {
    color: '#818cf8',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 16,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
    backgroundColor: '#0f172a',
    padding: 4,
    borderRadius: 10,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  typeButtonExpenseActive: {
    backgroundColor: '#ef4444',
  },
  typeButtonIncomeActive: {
    backgroundColor: '#10b981',
  },
  typeButtonTransferActive: {
    backgroundColor: '#6366f1',
  },
  typeButtonText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  typeButtonTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 14,
    color: '#f8fafc',
    marginBottom: 16,
    fontSize: 16,
  },
  label: {
    color: '#94a3b8',
    marginBottom: 8,
    fontSize: 14,
  },
  selectorContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  chipButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    marginRight: 8,
  },
  chipButtonActive: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  chipButtonTransferActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  chipButtonText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  chipButtonTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 10,
    paddingBottom: 20,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  cancelButtonText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 140,
    alignItems: 'center',
  },
  saveButtonExpense: {
    backgroundColor: '#ef4444',
  },
  saveButtonIncome: {
    backgroundColor: '#10b981',
  },
  saveButtonTransfer: {
    backgroundColor: '#6366f1',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
