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
  { label: string; iconName: keyof typeof Ionicons.glyphMap; description: string; color: string; gradientBg: string }
> = {
  CREDIT_CARD: {
    label: 'Tarjeta de Crédito',
    iconName: 'card-outline',
    description: 'Línea de crédito para compras a meses o pagos diferidos',
    color: '#0891b2',
    gradientBg: '#0e3a53',
  },
  CHECKING: {
    label: 'Cuenta Bancaria / Débito',
    iconName: 'business-outline',
    description: 'Tu cuenta de nómina, cheques o tarjeta de débito diaria',
    color: '#6366f1',
    gradientBg: '#1e1b4b',
  },
  SAVINGS: {
    label: 'Cuenta de Ahorro',
    iconName: 'trending-up-outline',
    description: 'Fondo de emergencia o ahorros con rendimientos',
    color: '#10b981',
    gradientBg: '#064e3b',
  },
  CASH: {
    label: 'Efectivo en Mano',
    iconName: 'cash-outline',
    description: 'Billetes y monedas en tu cartera o caja chica',
    color: '#f59e0b',
    gradientBg: '#451a03',
  },
  DIGITAL_WALLET: {
    label: 'Billetera Digital',
    iconName: 'phone-portrait-outline',
    description: 'Mercado Pago, PayPal, Didi Pay, etc.',
    color: '#a855f7',
    gradientBg: '#3b0764',
  },
  OTHER: {
    label: 'Otra Cuenta',
    iconName: 'layers-outline',
    description: 'Cualquier otro activo o instrumento financiero',
    color: '#64748b',
    gradientBg: '#1e293b',
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

  // Wizard state:
  // For standard accounts: 1: Nombre, 2: Tipo, 3: Saldo, 4: Resumen
  // For credit cards: 1: Nombre, 2: Tipo, 3: Límite crédito, 4: Saldo utilizado, 5: Resumen
  const [step, setStep] = useState<number>(1);

  // Form fields
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('CHECKING');
  const [currency] = useState('MXN');
  const [balance, setBalance] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [usedBalance, setUsedBalance] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isCredit = type === 'CREDIT_CARD';
  const totalSteps = isCredit ? 5 : 4;

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
    } else if (step === 3) {
      if (!isCredit) {
        // Standard account: proceed to summary
        setStep(4);
      } else {
        // Credit card: proceed to used balance step
        setStep(4);
      }
    } else if (step === 4) {
      if (isCredit) {
        setStep(5);
      }
    }
  };

  const handlePrevStep = () => {
    if (step > 1) {
      setStep((prev) => prev - 1);
    }
  };

  const handleCreate = async () => {
    try {
      setIsSubmitting(true);

      let initialBalanceNumber = 0;

      if (type === 'CREDIT_CARD') {
        const parsedUsed = parseFloat(usedBalance);
        // Saldo deudor inicial (negativo)
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
      Alert.alert('Cuenta creada', `Tu cuenta "${name.trim()}" ha sido agregada con éxito.`);
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

  const selectedConfig = ACCOUNT_TYPE_CONFIG[type];

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
          <Ionicons name="add" size={18} color="#fff" style={styles.btnIcon} />
          <Text style={styles.addButtonText}>Nueva Cuenta</Text>
        </TouchableOpacity>
      </View>

      {/* Lista de cuentas */}
      {accounts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconBadge}>
            <Ionicons name="wallet-outline" size={44} color="#6366f1" />
          </View>
          <Text style={styles.emptyText}>No tienes cuentas configuradas aún</Text>
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
            <Ionicons name="add-circle-outline" size={18} color="#fff" style={styles.btnIcon} />
            <Text style={styles.emptyButtonText}>Agregar mi primera cuenta</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={accounts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const isItemCredit = item.type === 'CREDIT_CARD';
            const config = ACCOUNT_TYPE_CONFIG[item.type] || ACCOUNT_TYPE_CONFIG.OTHER;
            const isNegative = item.initialBalance < 0;

            return (
              <View style={[styles.accountCard, isItemCredit && styles.creditCardBorder]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.iconBadge, { backgroundColor: `${config.color}22` }]}>
                    <Ionicons name={config.iconName} size={22} color={config.color} />
                  </View>
                  <View style={styles.accountInfo}>
                    <Text style={styles.accountName}>{item.name}</Text>
                    <Text style={[styles.accountType, isItemCredit && styles.creditCardType]}>
                      {config.label}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(item.id, item.name)}
                  >
                    <Ionicons name="trash-outline" size={16} color="#94a3b8" />
                  </TouchableOpacity>
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.balanceLabel}>
                    {isItemCredit ? (isNegative ? 'Deuda actual:' : 'Saldo:') : 'Saldo disponible:'}
                  </Text>
                  <Text
                    style={[
                      styles.balanceAmount,
                      isItemCredit && styles.creditBalanceAmount,
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
            {/* Header del Wizard con Progreso */}
            <View style={styles.wizardHeader}>
              <View style={styles.progressContainer}>
                <View
                  style={[
                    styles.progressBar,
                    { width: `${(step / totalSteps) * 100}%` },
                  ]}
                />
              </View>
              <View style={styles.stepIndicatorRow}>
                <View style={styles.stepBadge}>
                  <Text style={styles.stepText}>
                    Paso {step} de {totalSteps}
                  </Text>
                </View>
                <TouchableOpacity onPress={resetForm} style={styles.closeWizardBtn}>
                  <Ionicons name="close" size={18} color="#94a3b8" />
                  <Text style={styles.closeWizardText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Vista previa de Tarjeta Digital en vivo */}
            <View style={styles.previewSection}>
              <View style={[styles.virtualCard, { borderColor: selectedConfig.color }]}>
                <View style={styles.virtualCardTop}>
                  <View style={styles.virtualCardChip}>
                    <Ionicons name="hardware-chip-outline" size={26} color="#fbbf24" />
                    <Ionicons name="radio-outline" size={16} color="#94a3b8" style={{ marginLeft: 8 }} />
                  </View>
                  <View style={[styles.virtualCardTypeBadge, { backgroundColor: `${selectedConfig.color}25` }]}>
                    <Ionicons name={selectedConfig.iconName} size={14} color={selectedConfig.color} />
                    <Text style={[styles.virtualCardTypeLabel, { color: selectedConfig.color }]}>
                      {selectedConfig.label}
                    </Text>
                  </View>
                </View>

                <View style={styles.virtualCardMiddle}>
                  <Text style={styles.virtualCardName} numberOfLines={1}>
                    {name.trim() || 'Nombre de la Cuenta'}
                  </Text>
                </View>

                <View style={styles.virtualCardBottom}>
                  <View>
                    <Text style={styles.virtualCardBalanceTitle}>
                      {isCredit ? 'Crédito Disponible' : 'Saldo Disponible'}
                    </Text>
                    <Text style={styles.virtualCardBalanceAmount}>
                      $
                      {isCredit
                        ? calculatedAvailable.toFixed(2)
                        : (parseFloat(balance) || 0).toFixed(2)}{' '}
                      MXN
                    </Text>
                  </View>
                  {isCredit && numUsed > 0 && (
                    <View style={styles.virtualCardDebt}>
                      <Text style={styles.virtualCardDebtTitle}>Deuda</Text>
                      <Text style={styles.virtualCardDebtAmount}>
                        -${numUsed.toFixed(2)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            <ScrollView contentContainerStyle={styles.wizardScrollContent}>
              {/* PASO 1: Nombre de la cuenta */}
              {step === 1 && (
                <View style={styles.stepView}>
                  <View style={styles.stepIconBadge}>
                    <Ionicons name="pricetag-outline" size={28} color="#6366f1" />
                  </View>
                  <Text style={styles.stepTitle}>¿Cómo quieres llamar a esta cuenta?</Text>
                  <Text style={styles.stepSubtitle}>
                    Elige un nombre descriptivo para identificarla en tus movimientos diarios.
                  </Text>

                  <TextInput
                    style={styles.largeInput}
                    placeholder="Ej. BBVA Nómina, Nu Crédito, Efectivo"
                    placeholderTextColor="#64748b"
                    value={name}
                    onChangeText={setName}
                    autoFocus
                  />

                  <Text style={styles.suggestionsHeader}>Sugerencias rápidas:</Text>
                  <View style={styles.quickSuggestionsRow}>
                    {['BBVA Nómina', 'Nu Crédito', 'Santander LikeU', 'Efectivo Diario', 'Mercado Pago'].map(
                      (sug) => (
                        <TouchableOpacity
                          key={sug}
                          style={styles.suggestionChip}
                          onPress={() => setName(sug)}
                        >
                          <Ionicons name="flash-outline" size={13} color="#6366f1" style={{ marginRight: 4 }} />
                          <Text style={styles.suggestionText}>{sug}</Text>
                        </TouchableOpacity>
                      ),
                    )}
                  </View>
                </View>
              )}

              {/* PASO 2: Tipo de cuenta */}
              {step === 2 && (
                <View style={styles.stepView}>
                  <View style={styles.stepIconBadge}>
                    <Ionicons name="options-outline" size={28} color="#6366f1" />
                  </View>
                  <Text style={styles.stepTitle}>¿Qué tipo de cuenta es &quot;{name}&quot;?</Text>
                  <Text style={styles.stepSubtitle}>
                    Selecciona la opción para adaptar la gestión de saldos y créditos.
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
                          <View
                            style={[
                              styles.typeOptionIconBox,
                              { backgroundColor: isSelected ? `${cfg.color}33` : '#1e293b' },
                            ]}
                          >
                            <Ionicons
                              name={cfg.iconName}
                              size={24}
                              color={isSelected ? cfg.color : '#94a3b8'}
                            />
                          </View>
                          <View style={styles.typeOptionInfo}>
                            <Text
                              style={[
                                styles.typeOptionLabel,
                                isSelected && { color: cfg.color },
                              ]}
                            >
                              {cfg.label}
                            </Text>
                            <Text style={styles.typeOptionDesc}>{cfg.description}</Text>
                          </View>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={22} color={cfg.color} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* PASO 3: Saldo Disponible (Standard) O Límite de Crédito (Crédito) */}
              {step === 3 && (
                <View style={styles.stepView}>
                  {!isCredit ? (
                    <>
                      <View style={styles.stepIconBadge}>
                        <Ionicons name="cash-outline" size={28} color="#10b981" />
                      </View>
                      <Text style={styles.stepTitle}>¿Cuál es tu saldo actual en {name}?</Text>
                      <Text style={styles.stepSubtitle}>
                        Ingresa el dinero líquido disponible que tienes en esta cuenta al día de hoy.
                      </Text>

                      <View style={styles.amountInputHeroContainer}>
                        <Text style={styles.currencySymbol}>$</Text>
                        <TextInput
                          style={styles.heroAmountInput}
                          placeholder="0.00"
                          placeholderTextColor="#64748b"
                          keyboardType="numeric"
                          value={balance}
                          onChangeText={setBalance}
                          autoFocus
                        />
                        <Text style={styles.currencyCode}>{currency}</Text>
                      </View>

                      <View style={styles.quickAmountRow}>
                        {['0', '500', '1000', '5000', '10000'].map((val) => (
                          <TouchableOpacity
                            key={val}
                            style={styles.quickAmountChip}
                            onPress={() => setBalance(val)}
                          >
                            <Text style={styles.quickAmountText}>
                              {val === '0' ? '$0' : `+$${val}`}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={styles.stepIconBadge}>
                        <Ionicons name="card-outline" size={28} color="#0891b2" />
                      </View>
                      <Text style={styles.stepTitle}>Límite de Crédito Total</Text>
                      <Text style={styles.stepSubtitle}>
                        Ingresa la línea de crédito autorizada o límite total de tu tarjeta.
                      </Text>

                      <View style={styles.amountInputHeroContainer}>
                        <Text style={styles.currencySymbol}>$</Text>
                        <TextInput
                          style={styles.heroAmountInput}
                          placeholder="0.00"
                          placeholderTextColor="#64748b"
                          keyboardType="numeric"
                          value={creditLimit}
                          onChangeText={setCreditLimit}
                          autoFocus
                        />
                        <Text style={styles.currencyCode}>{currency}</Text>
                      </View>

                      <View style={styles.quickAmountRow}>
                        {['5000', '10000', '20000', '50000'].map((val) => (
                          <TouchableOpacity
                            key={val}
                            style={styles.quickAmountChip}
                            onPress={() => setCreditLimit(val)}
                          >
                            <Text style={styles.quickAmountText}>${val}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}
                </View>
              )}

              {/* PASO 4 (Para Crédito): Saldo Utilizado / Deuda Actual */}
              {step === 4 && isCredit && (
                <View style={styles.stepView}>
                  <View style={styles.stepIconBadge}>
                    <Ionicons name="trending-down-outline" size={28} color="#ef4444" />
                  </View>
                  <Text style={styles.stepTitle}>Saldo Utilizado hasta el momento</Text>
                  <Text style={styles.stepSubtitle}>
                    Si ya realizaste compras que tienes pendientes de pagar, regístralas aquí (opcional).
                  </Text>

                  <View style={styles.amountInputHeroContainer}>
                    <Text style={[styles.currencySymbol, { color: '#ef4444' }]}>-$</Text>
                    <TextInput
                      style={[styles.heroAmountInput, { color: '#ef4444' }]}
                      placeholder="0.00"
                      placeholderTextColor="#64748b"
                      keyboardType="numeric"
                      value={usedBalance}
                      onChangeText={setUsedBalance}
                      autoFocus
                    />
                    <Text style={styles.currencyCode}>{currency}</Text>
                  </View>

                  <View style={styles.creditSummaryBox}>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Límite asignado:</Text>
                      <Text style={styles.summaryVal}>${numCreditLimit.toFixed(2)} MXN</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Saldo deudor / utilizado:</Text>
                      <Text style={[styles.summaryVal, { color: '#ef4444' }]}>
                        -${numUsed.toFixed(2)} MXN
                      </Text>
                    </View>
                    <View style={[styles.summaryRow, styles.summaryTotalRow]}>
                      <Text style={styles.summaryTotalLabel}>Crédito disponible para compras:</Text>
                      <Text style={styles.summaryTotalVal}>
                        ${calculatedAvailable.toFixed(2)} MXN
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* PASO FINAL: Resumen & Confirmación (Paso 4 para estándar, Paso 5 para crédito) */}
              {((!isCredit && step === 4) || (isCredit && step === 5)) && (
                <View style={styles.stepView}>
                  <View style={styles.stepIconBadge}>
                    <Ionicons name="checkmark-done-circle-outline" size={28} color="#10b981" />
                  </View>
                  <Text style={styles.stepTitle}>Confirma tu nueva cuenta</Text>
                  <Text style={styles.stepSubtitle}>
                    Revisa que todos los datos sean correctos antes de guardar.
                  </Text>

                  <View style={styles.confirmationCard}>
                    <View style={styles.confirmationRow}>
                      <Text style={styles.confirmationLabel}>Nombre:</Text>
                      <Text style={styles.confirmationValue}>{name.trim()}</Text>
                    </View>
                    <View style={styles.confirmationRow}>
                      <Text style={styles.confirmationLabel}>Tipo de cuenta:</Text>
                      <View style={styles.confirmationTypeBadge}>
                        <Ionicons name={selectedConfig.iconName} size={14} color={selectedConfig.color} />
                        <Text style={[styles.confirmationTypeValue, { color: selectedConfig.color }]}>
                          {selectedConfig.label}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.confirmationRow}>
                      <Text style={styles.confirmationLabel}>Moneda:</Text>
                      <Text style={styles.confirmationValue}>{currency}</Text>
                    </View>

                    <View style={styles.confirmationDivider} />

                    {!isCredit ? (
                      <View style={styles.confirmationRow}>
                        <Text style={styles.confirmationLabel}>Saldo inicial disponible:</Text>
                        <Text style={[styles.confirmationValue, styles.confirmationHeroBalance]}>
                          ${(parseFloat(balance) || 0).toFixed(2)} {currency}
                        </Text>
                      </View>
                    ) : (
                      <>
                        <View style={styles.confirmationRow}>
                          <Text style={styles.confirmationLabel}>Límite de crédito:</Text>
                          <Text style={styles.confirmationValue}>${numCreditLimit.toFixed(2)} {currency}</Text>
                        </View>
                        <View style={styles.confirmationRow}>
                          <Text style={styles.confirmationLabel}>Saldo utilizado inicial:</Text>
                          <Text style={[styles.confirmationValue, { color: '#ef4444' }]}>
                            -${numUsed.toFixed(2)} {currency}
                          </Text>
                        </View>
                        <View style={styles.confirmationRow}>
                          <Text style={styles.confirmationLabel}>Crédito disponible:</Text>
                          <Text style={[styles.confirmationValue, styles.confirmationHeroBalance]}>
                            ${calculatedAvailable.toFixed(2)} {currency}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Footer de navegación del Wizard */}
            <View style={styles.wizardFooter}>
              {step > 1 ? (
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={handlePrevStep}
                  disabled={isSubmitting}
                >
                  <Ionicons name="arrow-back" size={16} color="#94a3b8" style={{ marginRight: 6 }} />
                  <Text style={styles.backButtonText}>Atrás</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ width: 80 }} />
              )}

              {step < totalSteps ? (
                <TouchableOpacity style={styles.primaryButton} onPress={handleNextStep}>
                  <Text style={styles.primaryButtonText}>Siguiente</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginLeft: 6 }} />
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
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={styles.primaryButtonText}>Crear Cuenta</Text>
                    </>
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  btnIcon: {
    marginRight: 6,
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
  emptyIconBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
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
    flexDirection: 'row',
    alignItems: 'center',
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
    maxHeight: '94%',
  },
  wizardHeader: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  progressContainer: {
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    marginBottom: 10,
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
  stepBadge: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  stepText: {
    color: '#818cf8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  closeWizardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  closeWizardText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  previewSection: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  virtualCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    minHeight: 140,
    justifyContent: 'space-between',
  },
  virtualCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  virtualCardChip: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  virtualCardTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  virtualCardTypeLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  virtualCardMiddle: {
    marginVertical: 10,
  },
  virtualCardName: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  virtualCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  virtualCardBalanceTitle: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  virtualCardBalanceAmount: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 2,
  },
  virtualCardDebt: {
    alignItems: 'flex-end',
  },
  virtualCardDebtTitle: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '600',
  },
  virtualCardDebtAmount: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  wizardScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  stepView: {
    minHeight: 280,
  },
  stepIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 6,
    lineHeight: 26,
  },
  stepSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 18,
    marginBottom: 16,
  },
  largeInput: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    color: '#f8fafc',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  suggestionsHeader: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  quickSuggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  suggestionText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  typeCardsList: {
    gap: 10,
    marginBottom: 16,
  },
  typeOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  typeOptionCardActive: {
    borderColor: '#6366f1',
    backgroundColor: '#1e1b4b33',
  },
  typeOptionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
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
  typeOptionDesc: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 15,
  },
  amountInputHeroContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
  },
  currencySymbol: {
    color: '#6366f1',
    fontSize: 28,
    fontWeight: '800',
    marginRight: 6,
  },
  heroAmountInput: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#f8fafc',
    textAlign: 'center',
    minWidth: 140,
    padding: 0,
  },
  currencyCode: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 6,
  },
  quickAmountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 12,
  },
  quickAmountChip: {
    backgroundColor: '#0f172a',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  quickAmountText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  creditSummaryBox: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 14,
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
    fontSize: 13,
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
    fontSize: 13,
    fontWeight: 'bold',
  },
  summaryTotalVal: {
    color: '#38bdf8',
    fontSize: 15,
    fontWeight: 'bold',
  },
  confirmationCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 12,
  },
  confirmationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confirmationLabel: {
    color: '#94a3b8',
    fontSize: 13,
  },
  confirmationValue: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  confirmationTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  confirmationTypeValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  confirmationDivider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 4,
  },
  confirmationHeroBalance: {
    color: '#10b981',
    fontSize: 16,
  },
  wizardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  backButtonText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: 'bold',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 13,
    paddingHorizontal: 22,
    borderRadius: 10,
    minWidth: 130,
  },
  finishButton: {
    backgroundColor: '#10b981',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
