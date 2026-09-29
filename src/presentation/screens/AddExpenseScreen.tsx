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
import { Ionicons } from '@expo/vector-icons';
import { useAccounts } from '../../application/state/AccountsContext';
import { useTransactions } from '../../application/state/TransactionsContext';
import { toMinorUnits, toDecimal, Transaction } from '../../domain/models/Transaction';

type MovementTypeKey = 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'CARD_PAYMENT';
type PaymentMethodChoice = 'CARD' | 'CASH';

export const AddExpenseScreen = () => {
  const { accounts } = useAccounts();
  const {
    transactions,
    loadTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    isLoading,
  } = useTransactions();

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);

  // Wizard state: 1: Tipo, 2: Monto, 3: Cuentas/Método, 4: Detalles opcionales, 5: Resumen
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Form state
  const [movementType, setMovementType] = useState<MovementTypeKey>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [paymentMethodChoice, setPaymentMethodChoice] = useState<PaymentMethodChoice>('CARD');
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [merchant, setMerchant] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Clasificación de cuentas
  const bankAndDebitAccounts = accounts.filter((a) => a.type === 'CHECKING' || a.type === 'SAVINGS' || a.type === 'DIGITAL_WALLET');
  const cashAccounts = accounts.filter((a) => a.type === 'CASH');
  const creditCards = accounts.filter((a) => a.type === 'CREDIT_CARD');

  // Cuentas disponibles para pagar según el método elegido en "Pagar Tarjeta"
  const paymentSourceAccounts =
    paymentMethodChoice === 'CASH'
      ? cashAccounts.length > 0 ? cashAccounts : accounts.filter(a => a.type !== 'CREDIT_CARD')
      : bankAndDebitAccounts.length > 0 ? bankAndDebitAccounts : accounts.filter(a => a.type !== 'CREDIT_CARD');

  // Selección efectiva de cuentas
  const effectiveSourceAccountId =
    sourceAccountId ||
    (movementType === 'CARD_PAYMENT'
      ? paymentSourceAccounts[0]?.id || accounts[0]?.id || ''
      : accounts[0]?.id || '');

  const effectiveDestinationAccountId =
    destinationAccountId ||
    (movementType === 'CARD_PAYMENT'
      ? creditCards[0]?.id || accounts[0]?.id || ''
      : accounts.find((a) => a.id !== effectiveSourceAccountId)?.id || '');

  const selectedSourceAccount = accounts.find((a) => a.id === effectiveSourceAccountId);
  const selectedDestAccount = accounts.find((a) => a.id === effectiveDestinationAccountId);

  // Cargar transacciones al montar
  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const resetForm = () => {
    setStep(1);
    setEditingTransaction(null);
    setMovementType('EXPENSE');
    setAmount('');
    setPaymentMethodChoice('CARD');
    setSourceAccountId('');
    setDestinationAccountId('');
    setMerchant('');
    setDescription('');
    setIsModalVisible(false);
  };

  const openCreateModal = (initialType: MovementTypeKey = 'EXPENSE') => {
    setEditingTransaction(null);
    setStep(1);
    setMovementType(initialType);
    setAmount('');
    setMerchant('');
    setDescription('');

    if (initialType === 'CARD_PAYMENT') {
      setSourceAccountId(paymentSourceAccounts[0]?.id || '');
      setDestinationAccountId(creditCards[0]?.id || '');
    } else {
      if (accounts.length > 0) setSourceAccountId(accounts[0].id);
      if (accounts.length > 1) {
        const other = accounts.find((a) => a.id !== accounts[0].id);
        if (other) setDestinationAccountId(other.id);
      }
    }
    setIsModalVisible(true);
  };

  const openEditModal = (tx: Transaction) => {
    setEditingTransaction(tx);
    setStep(2); // Inicia en el monto para edición rápida

    const isCredit = accounts.find((a) => a.id === tx.accountId)?.type === 'CREDIT_CARD';
    const isCardPay =
      tx.type === 'TRANSFER' &&
      (isCredit || (tx.description && tx.description.toLowerCase().includes('tarjeta')));

    if (isCardPay) {
      setMovementType('CARD_PAYMENT');
    } else {
      setMovementType(tx.type as MovementTypeKey);
    }

    setAmount(toDecimal(tx.amountMinor).toString());
    setSourceAccountId(tx.accountId);
    if (tx.linkedTransactionId) {
      const linked = transactions.find((t) => t.id === tx.linkedTransactionId);
      if (linked) setDestinationAccountId(linked.accountId);
    }
    setMerchant(tx.merchant || tx.merchantRaw || '');
    setDescription(tx.description || '');
    setIsModalVisible(true);
  };

  const handleNextStep = () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      const parsed = parseFloat(amount);
      if (isNaN(parsed) || parsed <= 0) {
        Alert.alert('Monto inválido', 'Por favor ingresa un monto mayor a cero.');
        return;
      }
      setStep(3);
    } else if (step === 3) {
      if (movementType === 'EXPENSE' || movementType === 'INCOME') {
        if (!effectiveSourceAccountId) {
          Alert.alert('Cuenta requerida', 'Por favor selecciona una cuenta.');
          return;
        }
      } else if (movementType === 'TRANSFER' || movementType === 'CARD_PAYMENT') {
        if (!effectiveSourceAccountId || !effectiveDestinationAccountId) {
          Alert.alert('Cuentas requeridas', 'Selecciona cuenta de origen y de destino.');
          return;
        }
        if (effectiveSourceAccountId === effectiveDestinationAccountId) {
          Alert.alert('Cuentas iguales', 'La cuenta de origen y destino deben ser distintas.');
          return;
        }
      }
      setStep(4);
    } else if (step === 4) {
      setStep(5);
    }
  };

  const handleSave = async () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Monto inválido', 'Por favor ingresa un monto mayor a cero.');
      return;
    }
    const amountMinor = toMinorUnits(parsedAmount);

    try {
      setIsSubmitting(true);

      // CASO: EDICIÓN DE MOVIMIENTO EXISTENTE
      if (editingTransaction) {
        await updateTransaction(editingTransaction.id, {
          amountMinor,
          merchant: merchant.trim() || null,
          merchantRaw: merchant.trim() || null,
          description: description.trim() || null,
        });

        // Si es transferencia vinculada, actualizar el monto en la contraria también
        if (editingTransaction.linkedTransactionId) {
          await updateTransaction(editingTransaction.linkedTransactionId, {
            amountMinor,
          });
        }

        resetForm();
        Alert.alert('¡Movimiento actualizado!', 'Los cambios se guardaron correctamente.');
        return;
      }

      // CASO: CREACIÓN NUEVA
      if (movementType === 'EXPENSE') {
        if (!selectedSourceAccount) return;
        const isCreditCard = selectedSourceAccount.type === 'CREDIT_CARD';

        await createTransaction({
          accountId: effectiveSourceAccountId,
          type: 'EXPENSE',
          amountMinor,
          currency: selectedSourceAccount.currency,
          occurredAt: new Date(),
          merchantRaw: merchant.trim() || undefined,
          description: description.trim() || undefined,
          source: 'MANUAL',
        });

        finishSuccess(
          isCreditCard
            ? `Compra a crédito registrada en "${selectedSourceAccount.name}" (no reduce tu saldo bancario)`
            : 'Gasto registrado correctamente',
        );
      } else if (movementType === 'INCOME') {
        if (!selectedSourceAccount) return;

        await createTransaction({
          accountId: effectiveSourceAccountId,
          type: 'INCOME',
          amountMinor,
          currency: selectedSourceAccount.currency,
          occurredAt: new Date(),
          merchantRaw: merchant.trim() || undefined,
          description: description.trim() || undefined,
          source: 'MANUAL',
        });

        finishSuccess('Ingreso registrado correctamente');
      } else if (movementType === 'TRANSFER') {
        if (!selectedSourceAccount || !selectedDestAccount) return;

        const outbound = await createTransaction({
          accountId: effectiveSourceAccountId,
          type: 'TRANSFER',
          amountMinor,
          currency: selectedSourceAccount.currency,
          occurredAt: new Date(),
          description: description.trim() || `Transferencia hacia ${selectedDestAccount.name}`,
          source: 'MANUAL',
        });

        const inbound = await createTransaction({
          accountId: effectiveDestinationAccountId,
          type: 'TRANSFER',
          amountMinor,
          currency: selectedDestAccount.currency,
          occurredAt: new Date(),
          description: description.trim() || `Transferencia desde ${selectedSourceAccount.name}`,
          linkedTransactionId: outbound.id,
          source: 'MANUAL',
        });

        await updateTransaction(outbound.id, { linkedTransactionId: inbound.id });
        finishSuccess('Transferencia registrada correctamente');
      } else if (movementType === 'CARD_PAYMENT') {
        if (!selectedSourceAccount || !selectedDestAccount) return;

        const payMethodLabel = paymentMethodChoice === 'CASH' ? 'en efectivo' : 'con tarjeta bancaria';

        const outbound = await createTransaction({
          accountId: effectiveSourceAccountId,
          type: 'TRANSFER',
          amountMinor,
          currency: selectedSourceAccount.currency,
          occurredAt: new Date(),
          description:
            description.trim() ||
            `Pago a tarjeta ${selectedDestAccount.name} (${payMethodLabel})`,
          source: 'MANUAL',
        });

        const inbound = await createTransaction({
          accountId: effectiveDestinationAccountId,
          type: 'TRANSFER',
          amountMinor,
          currency: selectedDestAccount.currency,
          occurredAt: new Date(),
          description:
            description.trim() ||
            `Abono a deuda desde ${selectedSourceAccount.name}`,
          linkedTransactionId: outbound.id,
          source: 'MANUAL',
        });

        await updateTransaction(outbound.id, { linkedTransactionId: inbound.id });

        finishSuccess(
          `Pago de tarjeta registrado: se descontó de "${selectedSourceAccount.name}" y se abonó a "${selectedDestAccount.name}"`,
        );
      }
    } catch (err: any) {
      console.error('Error al guardar movimiento:', err);
      Alert.alert('Error', err?.message || 'No se pudo guardar el movimiento');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTransaction = (tx: Transaction) => {
    Alert.alert(
      'Eliminar Movimiento',
      '¿Estás seguro que deseas eliminar este movimiento? Si es una transferencia, se eliminará el registro vinculado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsSubmitting(true);
              await deleteTransaction(tx.id);
              if (tx.linkedTransactionId) {
                await deleteTransaction(tx.linkedTransactionId);
              }
              resetForm();
              Alert.alert('Eliminado', 'El movimiento ha sido eliminado.');
            } catch (err: any) {
              Alert.alert('Error', err.message || 'No se pudo eliminar');
            } finally {
              setIsSubmitting(false);
            }
          },
        },
      ],
    );
  };

  const finishSuccess = (msg: string) => {
    Alert.alert('¡Listo!', msg);
    resetForm();
  };

  const parsedAmountPreview = parseFloat(amount) || 0;

  return (
    <View style={styles.container}>
      {/* Header de la pantalla */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Movimientos</Text>
          <Text style={styles.subtitle}>Toca cualquier movimiento para editarlo</Text>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => openCreateModal('EXPENSE')}>
          <Text style={styles.addButtonText}>+ Registrar</Text>
        </TouchableOpacity>
      </View>

      {/* Lista de movimientos */}
      {isLoading && transactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : transactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={48} color="#6366f1" />
          <Text style={styles.emptyText}>No hay movimientos registrados.</Text>
          <Text style={styles.emptySubtext}>
            Registra tu primer gasto, ingreso, transferencia o pago de tarjeta.
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => openCreateModal('EXPENSE')}
          >
            <Text style={styles.emptyButtonText}>Registrar mi primer movimiento</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const acc = accounts.find((a) => a.id === item.accountId);
            const isCreditCard = acc?.type === 'CREDIT_CARD';
            const isExpense = item.type === 'EXPENSE';
            const isIncome = item.type === 'INCOME';
            const isTransfer = item.type === 'TRANSFER';
            const isCardPayment =
              isTransfer &&
              (isCreditCard || (item.description && item.description.toLowerCase().includes('tarjeta')));

            const dateStr = new Date(item.occurredAt).toLocaleDateString('es-MX', {
              day: 'numeric',
              month: 'short',
            });

            return (
              <TouchableOpacity
                style={styles.txCard}
                activeOpacity={0.7}
                onPress={() => openEditModal(item)}
              >
                <View style={styles.txLeft}>
                  <View style={styles.txTypeRow}>
                    <View
                      style={[
                        styles.badge,
                        isCardPayment && styles.badgeCardPayment,
                        !isCardPayment && isExpense && isCreditCard && styles.badgeCreditExpense,
                        !isCardPayment && isExpense && !isCreditCard && styles.badgeExpense,
                        !isCardPayment && isIncome && styles.badgeIncome,
                        !isCardPayment && isTransfer && styles.badgeTransfer,
                      ]}
                    >
                      <Text style={styles.badgeText}>
                        {isCardPayment
                          ? 'PAGO TARJETA'
                          : isExpense && isCreditCard
                          ? 'COMPRA CRÉDITO'
                          : isExpense
                          ? 'GASTO'
                          : isIncome
                          ? 'INGRESO'
                          : 'TRANSFER'}
                      </Text>
                    </View>
                    <Text style={styles.txMerchant}>
                      {item.merchant || item.merchantRaw || item.description || 'Movimiento'}
                    </Text>
                  </View>
                  <Text style={styles.txSub}>
                    {acc?.name || 'Cuenta'} {isCreditCard ? '(Tarjeta Crédito)' : ''} • {dateStr}
                    {item.description && item.merchant ? ` • ${item.description}` : ''}
                  </Text>
                </View>

                <View style={styles.txRight}>
                  <Text
                    style={[
                      styles.txAmount,
                      isCardPayment && styles.amountCardPayment,
                      !isCardPayment && isExpense && isCreditCard && styles.amountCreditExpense,
                      !isCardPayment && isExpense && !isCreditCard && styles.amountExpense,
                      !isCardPayment && isIncome && styles.amountIncome,
                      !isCardPayment && isTransfer && styles.amountTransfer,
                    ]}
                  >
                    {isExpense ? '-' : isIncome ? '+' : '⇄'} ${toDecimal(item.amountMinor).toFixed(2)}{' '}
                    {item.currency}
                  </Text>
                  <View style={styles.editHintRow}>
                    <Ionicons name="pencil" size={11} color="#64748b" />
                    <Text style={styles.editHintText}>Editar</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Modal Wizard Inmersivo Paso a Paso */}
      <Modal visible={isModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.wizardContainer}>
            {/* Header del Wizard */}
            <View style={styles.wizardHeader}>
              <View style={styles.progressContainer}>
                <View style={[styles.progressBar, { width: `${(step / 5) * 100}%` }]} />
              </View>
              <View style={styles.stepIndicatorRow}>
                <Text style={styles.stepText}>
                  {editingTransaction ? 'Editando Movimiento' : `Paso ${step} de 5`}
                </Text>
                <TouchableOpacity onPress={resetForm} style={styles.closeWizardBtn}>
                  <Ionicons name="close" size={20} color="#94a3b8" />
                  <Text style={styles.closeWizardText}>Cerrar</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.wizardScrollContent}>
              {/* PASO 1: Tipo de Movimiento */}
              {step === 1 && (
                <View style={styles.stepView}>
                  <View style={styles.stepIconBadge}>
                    <Ionicons name="flash-outline" size={28} color="#6366f1" />
                  </View>
                  <Text style={styles.stepTitle}>¿Qué tipo de movimiento deseas registrar?</Text>
                  <Text style={styles.stepSubtitle}>
                    Selecciona la naturaleza de esta operación financiera.
                  </Text>

                  <View style={styles.typeOptionsList}>
                    <TouchableOpacity
                      style={[styles.typeOptionBox, movementType === 'EXPENSE' && styles.typeOptionBoxExpenseActive]}
                      onPress={() => setMovementType('EXPENSE')}
                    >
                      <Ionicons name="arrow-down-circle" size={24} color="#ef4444" />
                      <View style={styles.typeOptionBoxInfo}>
                        <Text style={styles.typeOptionBoxTitle}>Gasto / Compra</Text>
                        <Text style={styles.typeOptionBoxDesc}>Dinero que sale de tu banco, tarjeta o efectivo</Text>
                      </View>
                      {movementType === 'EXPENSE' && <Ionicons name="checkmark-circle" size={20} color="#ef4444" />}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.typeOptionBox, movementType === 'INCOME' && styles.typeOptionBoxIncomeActive]}
                      onPress={() => setMovementType('INCOME')}
                    >
                      <Ionicons name="arrow-up-circle" size={24} color="#10b981" />
                      <View style={styles.typeOptionBoxInfo}>
                        <Text style={styles.typeOptionBoxTitle}>Ingreso</Text>
                        <Text style={styles.typeOptionBoxDesc}>Dinero que entra (sueldo, ventas, depósitos)</Text>
                      </View>
                      {movementType === 'INCOME' && <Ionicons name="checkmark-circle" size={20} color="#10b981" />}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.typeOptionBox, movementType === 'TRANSFER' && styles.typeOptionBoxTransferActive]}
                      onPress={() => setMovementType('TRANSFER')}
                    >
                      <Ionicons name="swap-horizontal" size={24} color="#3b82f6" />
                      <View style={styles.typeOptionBoxInfo}>
                        <Text style={styles.typeOptionBoxTitle}>Transferencia entre Cuentas</Text>
                        <Text style={styles.typeOptionBoxDesc}>Mover dinero propio de una cuenta a otra</Text>
                      </View>
                      {movementType === 'TRANSFER' && <Ionicons name="checkmark-circle" size={20} color="#3b82f6" />}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.typeOptionBox, movementType === 'CARD_PAYMENT' && styles.typeOptionBoxCardPaymentActive]}
                      onPress={() => setMovementType('CARD_PAYMENT')}
                    >
                      <Ionicons name="card-outline" size={24} color="#a855f7" />
                      <View style={styles.typeOptionBoxInfo}>
                        <Text style={styles.typeOptionBoxTitle}>Pagar Tarjeta de Crédito</Text>
                        <Text style={styles.typeOptionBoxDesc}>Abonar a tu tarjeta en efectivo o con tu banco</Text>
                      </View>
                      {movementType === 'CARD_PAYMENT' && <Ionicons name="checkmark-circle" size={20} color="#a855f7" />}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* PASO 2: Monto */}
              {step === 2 && (
                <View style={styles.stepView}>
                  <View style={styles.stepIconBadge}>
                    <Ionicons name="cash-outline" size={28} color="#10b981" />
                  </View>
                  <Text style={styles.stepTitle}>¿Cuál es el monto?</Text>
                  <Text style={styles.stepSubtitle}>
                    {movementType === 'EXPENSE'
                      ? 'Ingresa el total gastado'
                      : movementType === 'INCOME'
                      ? 'Ingresa el total recibido'
                      : movementType === 'CARD_PAYMENT'
                      ? 'Ingresa el monto que vas a abonar a la tarjeta'
                      : 'Ingresa el monto a transferir'}
                  </Text>

                  <View style={styles.amountInputHeroContainer}>
                    <Text style={styles.currencySymbol}>$</Text>
                    <TextInput
                      style={styles.heroAmountInput}
                      placeholder="0.00"
                      placeholderTextColor="#64748b"
                      keyboardType="numeric"
                      value={amount}
                      onChangeText={setAmount}
                      autoFocus
                    />
                    <Text style={styles.currencyCode}>MXN</Text>
                  </View>

                  <View style={styles.quickAmountRow}>
                    {[50, 100, 200, 500, 1000].map((quick) => (
                      <TouchableOpacity
                        key={quick}
                        style={styles.quickAmountChip}
                        onPress={() => setAmount(quick.toString())}
                      >
                        <Text style={styles.quickAmountText}>${quick}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* PASO 3: Cuentas y Método de Pago */}
              {step === 3 && (
                <View style={styles.stepView}>
                  {movementType === 'CARD_PAYMENT' ? (
                    <>
                      <View style={styles.stepIconBadge}>
                        <Ionicons name="card-outline" size={28} color="#a855f7" />
                      </View>
                      <Text style={styles.stepTitle}>Detalle del Pago de Tarjeta</Text>
                      <Text style={styles.stepSubtitle}>
                        Elige si pagas con tarjeta bancaria o en efectivo, y qué tarjeta recibe el pago.
                      </Text>

                      {/* Selector de Método de Pago (Con Tarjeta vs En Efectivo) */}
                      <Text style={styles.inputSectionLabel}>1. ¿Cómo realizas el pago?</Text>
                      <View style={styles.paymentMethodSelector}>
                        <TouchableOpacity
                          style={[
                            styles.methodButton,
                            paymentMethodChoice === 'CARD' && styles.methodButtonActive,
                          ]}
                          onPress={() => {
                            setPaymentMethodChoice('CARD');
                            if (bankAndDebitAccounts.length > 0) {
                              setSourceAccountId(bankAndDebitAccounts[0].id);
                            }
                          }}
                        >
                          <Ionicons
                            name="card-outline"
                            size={16}
                            color={paymentMethodChoice === 'CARD' ? '#a855f7' : '#94a3b8'}
                          />
                          <Text
                            style={[
                              styles.methodButtonText,
                              paymentMethodChoice === 'CARD' && styles.methodButtonTextActive,
                            ]}
                          >
                            Con Tarjeta / Banco
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.methodButton,
                            paymentMethodChoice === 'CASH' && styles.methodButtonActive,
                          ]}
                          onPress={() => {
                            setPaymentMethodChoice('CASH');
                            if (cashAccounts.length > 0) {
                              setSourceAccountId(cashAccounts[0].id);
                            }
                          }}
                        >
                          <Ionicons
                            name="cash-outline"
                            size={16}
                            color={paymentMethodChoice === 'CASH' ? '#10b981' : '#94a3b8'}
                          />
                          <Text
                            style={[
                              styles.methodButtonText,
                              paymentMethodChoice === 'CASH' && styles.methodButtonTextActive,
                            ]}
                          >
                            En Efectivo
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Cuenta origen con la que se paga */}
                      <Text style={styles.inputSectionLabel}>
                        2. Cuenta con la que pagas ({paymentMethodChoice === 'CARD' ? 'Banco / Débito' : 'Efectivo'}):
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalSelector}>
                        {paymentSourceAccounts.map((acc) => (
                          <TouchableOpacity
                            key={acc.id}
                            style={[
                              styles.accountChip,
                              effectiveSourceAccountId === acc.id && styles.accountChipActive,
                            ]}
                            onPress={() => setSourceAccountId(acc.id)}
                          >
                            <Text
                              style={[
                                styles.accountChipText,
                                effectiveSourceAccountId === acc.id && styles.accountChipTextActive,
                              ]}
                            >
                              {acc.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>

                      {/* Tarjeta de crédito a la que se abona */}
                      <Text style={styles.inputSectionLabel}>3. Tarjeta de Crédito a la que abonas:</Text>
                      {creditCards.length === 0 ? (
                        <View style={styles.miniWarningBox}>
                          <Text style={styles.miniWarningText}>
                            No tienes tarjetas de crédito registradas. Agrégala primero en la pestaña &quot;Cuentas&quot;.
                          </Text>
                        </View>
                      ) : (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalSelector}>
                          {creditCards.map((card) => (
                            <TouchableOpacity
                              key={card.id}
                              style={[
                                styles.accountChip,
                                styles.creditCardChip,
                                effectiveDestinationAccountId === card.id && styles.creditCardChipActive,
                              ]}
                              onPress={() => setDestinationAccountId(card.id)}
                            >
                              <Ionicons
                                name="card-outline"
                                size={14}
                                color={effectiveDestinationAccountId === card.id ? '#38bdf8' : '#64748b'}
                                style={{ marginRight: 6 }}
                              />
                              <Text
                                style={[
                                  styles.accountChipText,
                                  effectiveDestinationAccountId === card.id && styles.creditCardChipTextActive,
                                ]}
                              >
                                {card.name}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      )}
                    </>
                  ) : (
                    <>
                      <View style={styles.stepIconBadge}>
                        <Ionicons name="wallet-outline" size={28} color="#6366f1" />
                      </View>
                      <Text style={styles.stepTitle}>
                        {movementType === 'EXPENSE'
                          ? '¿De qué cuenta sale el dinero?'
                          : movementType === 'INCOME'
                          ? '¿Qué cuenta recibe el dinero?'
                          : 'Cuentas para la transferencia'}
                      </Text>
                      <Text style={styles.stepSubtitle}>
                        Selecciona la cuenta involucrada en esta transacción.
                      </Text>

                      {/* Cuenta origen */}
                      <Text style={styles.inputSectionLabel}>
                        {movementType === 'INCOME' ? 'Cuenta destino (recibe):' : 'Cuenta de origen (paga):'}
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalSelector}>
                        {accounts.map((acc) => {
                          const isCard = acc.type === 'CREDIT_CARD';
                          return (
                            <TouchableOpacity
                              key={acc.id}
                              style={[
                                styles.accountChip,
                                effectiveSourceAccountId === acc.id && styles.accountChipActive,
                              ]}
                              onPress={() => setSourceAccountId(acc.id)}
                            >
                              {isCard && (
                                <Ionicons
                                  name="card-outline"
                                  size={14}
                                  color={effectiveSourceAccountId === acc.id ? '#38bdf8' : '#64748b'}
                                  style={{ marginRight: 6 }}
                                />
                              )}
                              <Text
                                style={[
                                  styles.accountChipText,
                                  effectiveSourceAccountId === acc.id && styles.accountChipTextActive,
                                ]}
                              >
                                {acc.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>

                      {movementType === 'EXPENSE' && selectedSourceAccount?.type === 'CREDIT_CARD' && (
                        <View style={styles.creditNoteBox}>
                          <Ionicons
                            name="information-circle-outline"
                            size={16}
                            color="#38bdf8"
                            style={{ marginRight: 6 }}
                          />
                          <Text style={styles.creditNoteText}>
                            Esta compra se registrará como deuda en tu tarjeta. No descontará saldo de tu banco.
                          </Text>
                        </View>
                      )}

                      {/* Cuenta destino para transferencias */}
                      {movementType === 'TRANSFER' && (
                        <>
                          <Text style={styles.inputSectionLabel}>Cuenta de destino (recibe fondos):</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalSelector}>
                            {accounts
                              .filter((a) => a.id !== effectiveSourceAccountId)
                              .map((acc) => (
                                <TouchableOpacity
                                  key={acc.id}
                                  style={[
                                    styles.accountChip,
                                    effectiveDestinationAccountId === acc.id && styles.accountChipActive,
                                  ]}
                                  onPress={() => setDestinationAccountId(acc.id)}
                                >
                                  {acc.type === 'CREDIT_CARD' && (
                                    <Ionicons
                                      name="card-outline"
                                      size={14}
                                      color={effectiveDestinationAccountId === acc.id ? '#38bdf8' : '#64748b'}
                                      style={{ marginRight: 6 }}
                                    />
                                  )}
                                  <Text
                                    style={[
                                      styles.accountChipText,
                                      effectiveDestinationAccountId === acc.id && styles.accountChipTextActive,
                                    ]}
                                  >
                                    {acc.name}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                          </ScrollView>
                        </>
                      )}
                    </>
                  )}
                </View>
              )}

              {/* PASO 4: Detalles Opcionales */}
              {step === 4 && (
                <View style={styles.stepView}>
                  <View style={styles.stepIconBadge}>
                    <Ionicons name="pricetag-outline" size={28} color="#6366f1" />
                  </View>
                  <Text style={styles.stepTitle}>Detalles y Notas (Opcional)</Text>
                  <Text style={styles.stepSubtitle}>
                    Agrega información adicional para identificar este movimiento después.
                  </Text>

                  {movementType !== 'TRANSFER' && movementType !== 'CARD_PAYMENT' && (
                    <>
                      <Text style={styles.inputSectionLabel}>
                        {movementType === 'EXPENSE' ? 'Comercio o Lugar' : 'Pagador o Cliente'}
                      </Text>
                      <TextInput
                        style={styles.fieldInput}
                        placeholder={movementType === 'EXPENSE' ? 'Ej. Walmart, Amazon, Oxxo' : 'Ej. Nómina, Reembolso'}
                        placeholderTextColor="#64748b"
                        value={merchant}
                        onChangeText={setMerchant}
                        autoFocus
                      />
                    </>
                  )}

                  <Text style={styles.inputSectionLabel}>Nota o Descripción libre</Text>
                  <TextInput
                    style={[styles.fieldInput, styles.multilineInput]}
                    placeholder={
                      movementType === 'CARD_PAYMENT'
                        ? 'Ej. Pago para no generar intereses del mes'
                        : movementType === 'EXPENSE'
                        ? 'Ej. Despensa semanal'
                        : 'Nota sobre la operación'
                    }
                    placeholderTextColor="#64748b"
                    value={description}
                    onChangeText={setDescription}
                    multiline
                  />
                </View>
              )}

              {/* PASO 5: Resumen y Confirmación */}
              {step === 5 && (
                <View style={styles.stepView}>
                  <View style={styles.stepIconBadge}>
                    <Ionicons name="checkmark-circle-outline" size={28} color="#10b981" />
                  </View>
                  <Text style={styles.stepTitle}>Confirma tu Movimiento</Text>
                  <Text style={styles.stepSubtitle}>
                    Revisa que todo esté correcto antes de guardar en tu historial.
                  </Text>

                  {/* Tarjeta de Recibo Estilizada */}
                  <View style={styles.receiptCard}>
                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptLabel}>Tipo:</Text>
                      <Text style={styles.receiptValue}>
                        {movementType === 'EXPENSE'
                          ? selectedSourceAccount?.type === 'CREDIT_CARD'
                            ? 'Compra a Crédito'
                            : 'Gasto'
                          : movementType === 'INCOME'
                          ? 'Ingreso'
                          : movementType === 'CARD_PAYMENT'
                          ? 'Pago de Tarjeta de Crédito'
                          : 'Transferencia'}
                      </Text>
                    </View>

                    <View style={styles.receiptRow}>
                      <Text style={styles.receiptLabel}>Monto:</Text>
                      <Text style={styles.receiptValueBig}>
                        ${parsedAmountPreview.toFixed(2)} MXN
                      </Text>
                    </View>

                    <View style={styles.receiptDivider} />

                    {movementType === 'CARD_PAYMENT' ? (
                      <>
                        <View style={styles.receiptRow}>
                          <Text style={styles.receiptLabel}>Método de pago:</Text>
                          <Text style={styles.receiptValue}>
                            {paymentMethodChoice === 'CASH' ? 'Efectivo' : 'Tarjeta / Banco'}
                          </Text>
                        </View>
                        <View style={styles.receiptRow}>
                          <Text style={styles.receiptLabel}>Cuenta que paga:</Text>
                          <Text style={styles.receiptValue}>{selectedSourceAccount?.name || '-'}</Text>
                        </View>
                        <View style={styles.receiptRow}>
                          <Text style={styles.receiptLabel}>Tarjeta que recibe:</Text>
                          <Text style={[styles.receiptValue, { color: '#38bdf8' }]}>
                            {selectedDestAccount?.name || '-'}
                          </Text>
                        </View>
                      </>
                    ) : movementType === 'TRANSFER' ? (
                      <>
                        <View style={styles.receiptRow}>
                          <Text style={styles.receiptLabel}>Cuenta origen:</Text>
                          <Text style={styles.receiptValue}>{selectedSourceAccount?.name || '-'}</Text>
                        </View>
                        <View style={styles.receiptRow}>
                          <Text style={styles.receiptLabel}>Cuenta destino:</Text>
                          <Text style={styles.receiptValue}>{selectedDestAccount?.name || '-'}</Text>
                        </View>
                      </>
                    ) : (
                      <View style={styles.receiptRow}>
                        <Text style={styles.receiptLabel}>Cuenta:</Text>
                        <Text style={styles.receiptValue}>{selectedSourceAccount?.name || '-'}</Text>
                      </View>
                    )}

                    {(merchant.trim() || description.trim()) && (
                      <>
                        <View style={styles.receiptDivider} />
                        {merchant.trim() && (
                          <View style={styles.receiptRow}>
                            <Text style={styles.receiptLabel}>Comercio / Fuente:</Text>
                            <Text style={styles.receiptValue}>{merchant}</Text>
                          </View>
                        )}
                        {description.trim() && (
                          <View style={styles.receiptRow}>
                            <Text style={styles.receiptLabel}>Nota:</Text>
                            <Text style={styles.receiptValue}>{description}</Text>
                          </View>
                        )}
                      </>
                    )}
                  </View>

                  {/* Botón de Eliminar si estamos editando */}
                  {editingTransaction && (
                    <TouchableOpacity
                      style={styles.deleteTxButton}
                      onPress={() => handleDeleteTransaction(editingTransaction)}
                      disabled={isSubmitting}
                    >
                      <Ionicons name="trash-outline" size={16} color="#ef4444" style={{ marginRight: 6 }} />
                      <Text style={styles.deleteTxButtonText}>Eliminar este movimiento</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>

            {/* Footer de Navegación del Wizard */}
            <View style={styles.wizardFooter}>
              {step > 1 ? (
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => setStep((prev) => (prev - 1) as any)}
                  disabled={isSubmitting}
                >
                  <Text style={styles.backButtonText}>← Atrás</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ width: 80 }} />
              )}

              {step < 5 ? (
                <TouchableOpacity style={styles.primaryButton} onPress={handleNextStep}>
                  <Text style={styles.primaryButtonText}>Siguiente →</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.primaryButton, styles.confirmButton]}
                  onPress={handleSave}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {editingTransaction ? 'Guardar Cambios' : 'Confirmar y Guardar'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
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
    paddingTop: 24,
    paddingBottom: 20,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  subtitle: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  addButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  txCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
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
  badgeCreditExpense: {
    backgroundColor: '#f59e0b22',
  },
  badgeIncome: {
    backgroundColor: '#10b98122',
  },
  badgeTransfer: {
    backgroundColor: '#6366f122',
  },
  badgeCardPayment: {
    backgroundColor: '#06b6d422',
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
    fontSize: 12,
  },
  txRight: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  amountExpense: {
    color: '#ef4444',
  },
  amountCreditExpense: {
    color: '#f59e0b',
  },
  amountIncome: {
    color: '#10b981',
  },
  amountTransfer: {
    color: '#818cf8',
  },
  amountCardPayment: {
    color: '#06b6d4',
  },
  editHintText: {
    color: '#64748b',
    fontSize: 11,
  },
  editHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  // Modal Wizard Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  wizardContainer: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: '94%',
  },
  wizardHeader: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  progressContainer: {
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 2,
  },
  stepIndicatorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closeWizardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  closeWizardText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  wizardScrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
  },
  stepView: {
    minHeight: 320,
  },
  stepIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 8,
    lineHeight: 28,
  },
  stepSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 20,
    marginBottom: 20,
  },
  typeOptionsList: {
    gap: 10,
  },
  typeOptionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  typeOptionBoxExpenseActive: {
    borderColor: '#ef4444',
    backgroundColor: '#ef444415',
  },
  typeOptionBoxIncomeActive: {
    borderColor: '#10b981',
    backgroundColor: '#10b98115',
  },
  typeOptionBoxTransferActive: {
    borderColor: '#6366f1',
    backgroundColor: '#6366f115',
  },
  typeOptionBoxCardPaymentActive: {
    borderColor: '#06b6d4',
    backgroundColor: '#06b6d415',
  },
  typeOptionBoxIcon: {
    fontSize: 24,
    marginRight: 14,
  },
  typeOptionBoxInfo: {
    flex: 1,
  },
  typeOptionBoxTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  typeOptionBoxDesc: {
    color: '#94a3b8',
    fontSize: 12,
  },
  checkMark: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  amountInputHeroContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  currencySymbol: {
    fontSize: 32,
    color: '#94a3b8',
    fontWeight: 'bold',
    marginRight: 8,
  },
  heroAmountInput: {
    fontSize: 40,
    color: '#f8fafc',
    fontWeight: 'bold',
    minWidth: 120,
    textAlign: 'center',
  },
  currencyCode: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  quickAmountRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickAmountChip: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  quickAmountText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  inputSectionLabel: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 6,
  },
  paymentMethodSelector: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  methodButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  methodButtonActive: {
    borderColor: '#06b6d4',
    backgroundColor: '#06b6d422',
  },
  methodButtonText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: 'bold',
  },
  methodButtonTextActive: {
    color: '#f8fafc',
  },
  horizontalSelector: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  accountChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#0f172a',
    borderWidth: 1.5,
    borderColor: '#334155',
    marginRight: 8,
  },
  accountChipActive: {
    borderColor: '#6366f1',
    backgroundColor: '#6366f122',
  },
  accountChipText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  accountChipTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  creditCardChip: {
    borderColor: '#0891b266',
  },
  creditCardChipActive: {
    borderColor: '#0891b2',
    backgroundColor: '#0891b222',
  },
  creditCardChipTextActive: {
    color: '#38bdf8',
    fontWeight: 'bold',
  },
  miniWarningBox: {
    backgroundColor: '#451a03',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  miniWarningText: {
    color: '#fde68a',
    fontSize: 12,
    lineHeight: 16,
  },
  creditNoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1b4b',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#4338ca',
  },
  creditNoteText: {
    color: '#c7d2fe',
    fontSize: 12,
    flex: 1,
  },
  fieldInput: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 14,
    color: '#f8fafc',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  receiptCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
    gap: 12,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLabel: {
    color: '#94a3b8',
    fontSize: 14,
  },
  receiptValue: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
  receiptValueBig: {
    color: '#10b981',
    fontSize: 22,
    fontWeight: 'bold',
  },
  receiptDivider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 4,
  },
  deleteTxButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ef444466',
    backgroundColor: '#ef444415',
  },
  deleteTxButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: 'bold',
  },
  wizardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  backButtonText: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: 'bold',
  },
  primaryButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
    alignItems: 'center',
    minWidth: 140,
  },
  confirmButton: {
    backgroundColor: '#10b981',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
