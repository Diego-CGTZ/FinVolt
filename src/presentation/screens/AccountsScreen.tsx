import React, { useState } from 'react';
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
import type { AccountType } from '../../domain/models/Account';

export const ACCOUNT_TYPE_CONFIG: Record<
  AccountType,
  { label: string; iconName: keyof typeof Ionicons.glyphMap; description: string; color: string }
> = {
  CREDIT_CARD: {
    label: 'Tarjeta de Crédito',
    iconName: 'card-outline',
    description: 'Línea de crédito para compras a meses o pagos diferidos',
    color: '#0891b2',
  },
  CHECKING: {
    label: 'Cuenta Bancaria / Débito',
    iconName: 'business-outline',
    description: 'Tu cuenta de nómina, cheques o tarjeta de débito diaria',
    color: '#6366f1',
  },
  SAVINGS: {
    label: 'Cuenta de Ahorro',
    iconName: 'trending-up-outline',
    description: 'Fondo de emergencia o ahorros con rendimientos',
    color: '#10b981',
  },
  CASH: {
    label: 'Efectivo en Mano',
    iconName: 'cash-outline',
    description: 'Billetes y monedas en tu cartera o caja chica',
    color: '#f59e0b',
  },
  DIGITAL_WALLET: {
    label: 'Billetera Digital',
    iconName: 'phone-portrait-outline',
    description: 'Mercado Pago, PayPal, Didi Pay, etc.',
    color: '#a855f7',
  },
  OTHER: {
    label: 'Otra Cuenta',
    iconName: 'layers-outline',
    description: 'Cualquier otro activo o instrumento financiero',
    color: '#64748b',
  },
};

const ACCOUNT_TYPES: AccountType[] = [
  'CHECKING',
  'CREDIT_CARD',
  'SAVINGS',
  'CASH',
  'DIGITAL_WALLET',
  'OTHER',
];

export const AccountsScreen = () => {
  const { accounts, isLoading, createAccount, deleteAccount } = useAccounts();
  const [isModalVisible, setIsModalVisible] = useState(false);

  // Wizard state: 1: Nombre, 2: Tipo de cuenta, 3: Saldo / Crédito
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form fields
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('CHECKING');
  const [currency] = useState('MXN');
  const [balance, setBalance] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [usedBalance, setUsedBalance] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setStep(1);
    setName('');
    setType('CHECKING');
    setBalance('');
    setCreditLimit('');
    setUsedBalance('');
    setIsModalVisible(false);
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!name.trim()) {
        Alert.alert('Nombre requerido', 'Por favor ingresa un nombre para identificar tu cuenta.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleCreate = async () => {
    try {
      setIsSubmitting(true);

      let initialBalanceNumber = 0;

      if (type === 'CREDIT_CARD') {
        const parsedUsed = parseFloat(usedBalance);
        // Si ha utilizado crédito, se registra como saldo deudor inicial (negativo)
        initialBalanceNumber = !isNaN(parsedUsed) && parsedUsed > 0 ? -parsedUsed : 0;
      } else {
        const parsedBalance = parseFloat(balance);
        initialBalanceNumber = !isNaN(parsedBalance) ? parsedBalance : 0;
      }

      await createAccount({
        name: name.trim(),
        type,
        currency,
        initialBalance: initialBalanceNumber,
      });

      resetForm();
      Alert.alert('¡Cuenta creada!', `Tu cuenta "${name.trim()}" ha sido agregada con éxito.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo crear la cuenta');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (id: string, accountName: string) => {
    Alert.alert(
      'Eliminar Cuenta',
      `¿Estás seguro que deseas eliminar "${accountName}"? Esta acción borrará la cuenta y sus movimientos asociados.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount(id);
            } catch (err: any) {
              Alert.alert('Error', err.message || 'No se pudo eliminar la cuenta');
            }
          },
        },
      ],
    );
  };

  if (isLoading && accounts.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  // Cálculos dinámicos en vivo para tarjetas de crédito
  const numCreditLimit = parseFloat(creditLimit) || 0;
  const numUsed = parseFloat(usedBalance) || 0;
  const calculatedAvailable = Math.max(0, numCreditLimit - numUsed);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Mis Cuentas</Text>
          <Text style={styles.subtitle}>{accounts.length} activas en tu portafolio</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            setStep(1);
            setIsModalVisible(true);
          }}
        >
          <Text style={styles.addButtonText}>+ Nueva Cuenta</Text>
        </TouchableOpacity>
      </View>

      {/* Lista de cuentas */}
      {accounts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="wallet-outline" size={48} color="#6366f1" />
          <Text style={styles.emptyText}>No tienes cuentas configuradas aún.</Text>
          <Text style={styles.emptySubtext}>
            Agrega tu primera cuenta bancaria, tarjeta de crédito o efectivo para comenzar.
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => {
              setStep(1);
              setIsModalVisible(true);
            }}
          >
            <Text style={styles.emptyButtonText}>Agregar mi primera cuenta</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={accounts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const isCredit = item.type === 'CREDIT_CARD';
            const config = ACCOUNT_TYPE_CONFIG[item.type] || ACCOUNT_TYPE_CONFIG.OTHER;
            const isNegative = item.initialBalance < 0;

            return (
              <View style={[styles.accountCard, isCredit && styles.creditCardBorder]}>
                <View style={styles.cardHeader}>
                  <View style={styles.iconBadge}>
                    <Ionicons name={config.iconName} size={22} color={config.color} />
                  </View>
                  <View style={styles.accountInfo}>
                    <Text style={styles.accountName}>{item.name}</Text>
                    <Text style={[styles.accountType, isCredit && styles.creditCardType]}>
                      {config.label}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(item.id, item.name)}
                  >
                    <Ionicons name="close" size={16} color="#94a3b8" />
                  </TouchableOpacity>
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.balanceLabel}>
                    {isCredit ? (isNegative ? 'Deuda actual:' : 'Saldo:') : 'Saldo disponible:'}
                  </Text>
                  <Text
                    style={[
                      styles.balanceAmount,
                      isCredit && styles.creditBalanceAmount,
                      isNegative && styles.negativeBalance,
                    ]}
                  >
                    {isNegative ? '-' : ''}${Math.abs(item.initialBalance).toFixed(2)} {item.currency}
                  </Text>
                </View>
              </View>
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
                <View style={[styles.progressBar, { width: `${(step / 3) * 100}%` }]} />
              </View>
              <View style={styles.stepIndicatorRow}>
                <Text style={styles.stepText}>Paso {step} de 3</Text>
                <TouchableOpacity onPress={resetForm}>
                  <Text style={styles.closeWizardText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.wizardScrollContent}>
              {/* PASO 1: Nombre de la cuenta */}
              {step === 1 && (
                <View style={styles.stepView}>
                  <View style={styles.stepIconBadge}>
                    <Ionicons name="pricetag-outline" size={32} color="#6366f1" />
                  </View>
                  <Text style={styles.stepTitle}>¿Cómo quieres llamar a esta cuenta?</Text>
                  <Text style={styles.stepSubtitle}>
                    Elige un nombre claro para reconocerla en tus movimientos.
                  </Text>

                  <TextInput
                    style={styles.largeInput}
                    placeholder="Ej. BBVA Nómina, Nu Crédito, Cartera"
                    placeholderTextColor="#64748b"
                    value={name}
                    onChangeText={setName}
                    autoFocus
                  />

                  <View style={styles.quickSuggestionsRow}>
                    {['BBVA Nómina', 'Nu Crédito', 'Santander', 'Efectivo'].map((sug) => (
                      <TouchableOpacity
                        key={sug}
                        style={styles.suggestionChip}
                        onPress={() => setName(sug)}
                      >
                        <Text style={styles.suggestionText}>{sug}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* PASO 2: Tipo de cuenta */}
              {step === 2 && (
                <View style={styles.stepView}>
                  <View style={styles.stepIconBadge}>
                    <Ionicons name="options-outline" size={32} color="#6366f1" />
                  </View>
                  <Text style={styles.stepTitle}>¿Qué tipo de cuenta es &quot;{name}&quot;?</Text>
                  <Text style={styles.stepSubtitle}>
                    Esto define si representa dinero líquido disponible o una línea de crédito.
                  </Text>

                  <View style={styles.typeCardsList}>
                    {ACCOUNT_TYPES.map((t) => {
                      const cfg = ACCOUNT_TYPE_CONFIG[t];
                      const isSelected = type === t;
                      return (
                        <TouchableOpacity
                          key={t}
                          style={[styles.typeOptionCard, isSelected && styles.typeOptionCardActive]}
                          onPress={() => setType(t)}
                        >
                          <Ionicons
                            name={cfg.iconName}
                            size={24}
                            color={isSelected ? '#6366f1' : cfg.color}
                          />
                          <View style={styles.typeOptionInfo}>
                            <Text
                              style={[
                                styles.typeOptionLabel,
                                isSelected && styles.typeOptionLabelActive,
                              ]}
                            >
                              {cfg.label}
                            </Text>
                            <Text style={styles.typeOptionDesc}>{cfg.description}</Text>
                          </View>
                          {isSelected && <Ionicons name="checkmark-circle" size={20} color="#6366f1" />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* PASO 3: Balances y Crédito */}
              {step === 3 && (
                <View style={styles.stepView}>
                  {type === 'CREDIT_CARD' ? (
                    <>
                      <View style={styles.stepIconBadge}>
                        <Ionicons name="card-outline" size={32} color="#0891b2" />
                      </View>
                      <Text style={styles.stepTitle}>Configura tu Tarjeta de Crédito</Text>
                      <Text style={styles.stepSubtitle}>
                        Registra tu límite total y si ya tienes algún saldo gastado a la fecha.
                      </Text>

                      {/* Límite de Crédito */}
                      <Text style={styles.inputLabel}>Límite de Crédito total (Opcional)</Text>
                      <TextInput
                        style={styles.largeInput}
                        placeholder="$ 0.00"
                        placeholderTextColor="#64748b"
                        keyboardType="numeric"
                        value={creditLimit}
                        onChangeText={setCreditLimit}
                        autoFocus
                      />

                      {/* Saldo utilizado hasta el momento */}
                      <Text style={styles.inputLabel}>Saldo utilizado / Deuda actual (Opcional)</Text>
                      <TextInput
                        style={styles.largeInput}
                        placeholder="$ 0.00"
                        placeholderTextColor="#64748b"
                        keyboardType="numeric"
                        value={usedBalance}
                        onChangeText={setUsedBalance}
                      />

                      {/* Resumen dinámico */}
                      {numCreditLimit > 0 && (
                        <View style={styles.creditSummaryBox}>
                          <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Límite total:</Text>
                            <Text style={styles.summaryVal}>${numCreditLimit.toFixed(2)} MXN</Text>
                          </View>
                          <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Saldo utilizado:</Text>
                            <Text style={[styles.summaryVal, { color: '#ef4444' }]}>
                              -${numUsed.toFixed(2)} MXN
                            </Text>
                          </View>
                          <View style={[styles.summaryRow, styles.summaryTotalRow]}>
                            <Text style={styles.summaryTotalLabel}>Crédito disponible para gastar:</Text>
                            <Text style={styles.summaryTotalVal}>
                              ${calculatedAvailable.toFixed(2)} MXN
                            </Text>
                          </View>
                        </View>
                      )}
                    </>
                  ) : (
                    <>
                      <View style={styles.stepIconBadge}>
                        <Ionicons name="cash-outline" size={32} color="#10b981" />
                      </View>
                      <Text style={styles.stepTitle}>¿Cuál es tu saldo actual en {name}?</Text>
                      <Text style={styles.stepSubtitle}>
                        Ingresa el dinero que tienes en esta cuenta al día de hoy.
                      </Text>

                      <Text style={styles.inputLabel}>Saldo disponible ({currency})</Text>
                      <TextInput
                        style={[styles.largeInput, styles.heroBalanceInput]}
                        placeholder="0.00"
                        placeholderTextColor="#64748b"
                        keyboardType="numeric"
                        value={balance}
                        onChangeText={setBalance}
                        autoFocus
                      />
                    </>
                  )}
                </View>
              )}
            </ScrollView>

            {/* Footer de navegación del Wizard */}
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

              {step < 3 ? (
                <TouchableOpacity style={styles.primaryButton} onPress={handleNextStep}>
                  <Text style={styles.primaryButtonText}>Siguiente →</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.primaryButton, styles.finishButton]}
                  onPress={handleCreate}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Guardar Cuenta</Text>
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
    fontSize: 13,
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
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
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
  list: {
    padding: 16,
    gap: 12,
  },
  accountCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  creditCardBorder: {
    borderColor: '#0891b2',
    backgroundColor: '#111e38',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardIcon: {
    fontSize: 20,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 2,
  },
  accountType: {
    fontSize: 12,
    color: '#94a3b8',
  },
  creditCardType: {
    color: '#38bdf8',
    fontWeight: '600',
  },
  deleteButton: {
    padding: 8,
  },
  deleteText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#33415555',
  },
  balanceLabel: {
    fontSize: 13,
    color: '#94a3b8',
  },
  balanceAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#10b981',
  },
  creditBalanceAmount: {
    color: '#38bdf8',
  },
  negativeBalance: {
    color: '#ef4444',
  },
  // Wizard Styles
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
    maxHeight: '92%',
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
    marginBottom: 24,
  },
  inputLabel: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  largeInput: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    color: '#f8fafc',
    fontSize: 18,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  heroBalanceInput: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#10b981',
    paddingVertical: 20,
  },
  quickSuggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  suggestionChip: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  suggestionText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  typeCardsList: {
    gap: 10,
    marginBottom: 16,
  },
  typeOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  typeOptionCardActive: {
    borderColor: '#6366f1',
    backgroundColor: '#1e1b4b33',
  },
  typeOptionIcon: {
    fontSize: 24,
    marginRight: 14,
  },
  typeOptionInfo: {
    flex: 1,
  },
  typeOptionLabel: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  typeOptionLabelActive: {
    color: '#818cf8',
  },
  typeOptionDesc: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 16,
  },
  checkmarkIcon: {
    color: '#818cf8',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  creditSummaryBox: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#0891b244',
    marginTop: 8,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    color: '#94a3b8',
    fontSize: 13,
  },
  summaryVal: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
  summaryTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 8,
    marginTop: 4,
  },
  summaryTotalLabel: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: 'bold',
  },
  summaryTotalVal: {
    color: '#38bdf8',
    fontSize: 16,
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
  finishButton: {
    backgroundColor: '#10b981',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
