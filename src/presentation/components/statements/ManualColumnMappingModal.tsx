/**
 * US-042: Componente Modal de Mapeo Manual de Columnas
 *
 * Permite al usuario mapear manualmente columnas bancarias/contables
 * cuando la detección automática falla, previsualizar los resultados
 * en tiempo real y guardar plantillas reutilizables.
 *
 * REGLA ESTRICTA DE UI:
 * Cero emojis en cualquier elemento visual o texto. Uso exclusivo de
 * iconos vectoriales Ionicons y tipografía limpia.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type {
  AmountMode,
  ColumnMappingConfig,
  MappingPreviewResult,
  MappingTemplate,
} from '../../../domain/interfaces/IColumnMappingService';
import { defaultColumnMappingService } from '../../../domain/services/mapping/ColumnMappingService';
import { defaultMappingTemplateRepository } from '../../../infrastructure/database/AsyncStorageMappingTemplateRepository';

export interface ManualColumnMappingModalProps {
  visible: boolean;
  headers: string[];
  sampleRows: any[][];
  initialMapping?: Partial<ColumnMappingConfig>;
  fileName?: string;
  userId?: string;
  onClose: () => void;
  onApplyMapping: (mapping: ColumnMappingConfig, templateSaved?: MappingTemplate) => void;
}

export function ManualColumnMappingModal({
  visible,
  headers,
  sampleRows,
  initialMapping,
  fileName,
  userId,
  onClose,
  onApplyMapping,
}: ManualColumnMappingModalProps) {
  const [amountMode, setAmountMode] = useState<AmountMode>(initialMapping?.amountMode || 'SINGLE');
  const [dateColumn, setDateColumn] = useState<string>(String(initialMapping?.dateColumn || ''));
  const [amountColumn, setAmountColumn] = useState<string>(String(initialMapping?.amountColumn || ''));
  const [chargeColumn, setChargeColumn] = useState<string>(String(initialMapping?.chargeColumn || ''));
  const [creditColumn, setCreditColumn] = useState<string>(String(initialMapping?.creditColumn || ''));
  const [descriptionColumn, setDescriptionColumn] = useState<string>(String(initialMapping?.descriptionColumn || ''));
  const [merchantColumn, setMerchantColumn] = useState<string>(String(initialMapping?.merchantColumn || ''));
  const [typeColumn, setTypeColumn] = useState<string>(String(initialMapping?.typeColumn || ''));
  const [currencyColumn, setCurrencyColumn] = useState<string>(String(initialMapping?.currencyColumn || ''));
  const [referenceColumn, setReferenceColumn] = useState<string>(String(initialMapping?.referenceColumn || ''));

  const [saveAsTemplate, setSaveAsTemplate] = useState<boolean>(false);
  const [templateName, setTemplateName] = useState<string>('');
  const [availableTemplates, setAvailableTemplates] = useState<MappingTemplate[]>([]);

  const applyTemplate = useCallback((tpl: MappingTemplate) => {
    const m = tpl.mapping;
    setAmountMode(m.amountMode || 'SINGLE');
    if (m.dateColumn !== undefined) setDateColumn(String(m.dateColumn));
    if (m.amountColumn !== undefined) setAmountColumn(String(m.amountColumn));
    if (m.chargeColumn !== undefined) setChargeColumn(String(m.chargeColumn));
    if (m.creditColumn !== undefined) setCreditColumn(String(m.creditColumn));
    if (m.descriptionColumn !== undefined) setDescriptionColumn(String(m.descriptionColumn));
    if (m.merchantColumn !== undefined) setMerchantColumn(String(m.merchantColumn));
    if (m.typeColumn !== undefined) setTypeColumn(String(m.typeColumn));
    if (m.currencyColumn !== undefined) setCurrencyColumn(String(m.currencyColumn));
    if (m.referenceColumn !== undefined) setReferenceColumn(String(m.referenceColumn));
  }, []);

  // Cargar plantillas guardadas al abrir el modal
  useEffect(() => {
    if (!visible) return;

    let isMounted = true;
    defaultMappingTemplateRepository.findAll(userId).then((templates) => {
      if (!isMounted) return;
      setAvailableTemplates(templates);

      // Si existe una plantilla coincidente para este archivo, auto-sugerirla
      const matched = defaultColumnMappingService.findBestTemplate(headers, templates);
      if (matched && (!dateColumn && !amountColumn && !chargeColumn)) {
        applyTemplate(matched);
      }
    }).catch(() => {
      // Manejo silencioso
    });

    return () => {
      isMounted = false;
    };
  }, [visible, userId, headers, dateColumn, amountColumn, chargeColumn, applyTemplate]);

  // Previsualización derivada en tiempo real ante cualquier cambio de configuración
  const previewResult = useMemo<MappingPreviewResult | null>(() => {
    if (!visible || !headers || headers.length === 0) return null;

    const currentConfig: ColumnMappingConfig = {
      dateColumn: dateColumn || undefined,
      amountMode,
      amountColumn: amountMode === 'SINGLE' ? (amountColumn || undefined) : undefined,
      chargeColumn: amountMode === 'SPLIT' ? (chargeColumn || undefined) : undefined,
      creditColumn: amountMode === 'SPLIT' ? (creditColumn || undefined) : undefined,
      descriptionColumn: descriptionColumn || undefined,
      merchantColumn: merchantColumn || undefined,
      typeColumn: typeColumn || undefined,
      currencyColumn: currencyColumn || undefined,
      referenceColumn: referenceColumn || undefined,
      defaultCurrency: 'MXN',
    };

    return defaultColumnMappingService.generatePreview(headers, sampleRows, currentConfig);
  }, [
    visible,
    headers,
    sampleRows,
    amountMode,
    dateColumn,
    amountColumn,
    chargeColumn,
    creditColumn,
    descriptionColumn,
    merchantColumn,
    typeColumn,
    currencyColumn,
    referenceColumn,
  ]);

  const handleApply = async () => {
    const finalConfig: ColumnMappingConfig = {
      dateColumn: dateColumn || undefined,
      amountMode,
      amountColumn: amountMode === 'SINGLE' ? (amountColumn || undefined) : undefined,
      chargeColumn: amountMode === 'SPLIT' ? (chargeColumn || undefined) : undefined,
      creditColumn: amountMode === 'SPLIT' ? (creditColumn || undefined) : undefined,
      descriptionColumn: descriptionColumn || undefined,
      merchantColumn: merchantColumn || undefined,
      typeColumn: typeColumn || undefined,
      currencyColumn: currencyColumn || undefined,
      referenceColumn: referenceColumn || undefined,
      defaultCurrency: 'MXN',
    };

    let savedTemplate: MappingTemplate | undefined;
    if (saveAsTemplate && templateName.trim()) {
      try {
        savedTemplate = await defaultMappingTemplateRepository.save({
          userId,
          name: templateName.trim(),
          headers,
          mapping: finalConfig,
        });
      } catch {
        // Continuar aunque falle el guardado opcional
      }
    }

    onApplyMapping(finalConfig, savedTemplate);
  };

  const renderDropdownSelector = (
    label: string,
    selectedValue: string,
    onSelect: (val: string) => void,
    required: boolean = false,
  ) => {
    return (
      <View style={styles.selectorGroup}>
        <View style={styles.labelRow}>
          <Text style={styles.selectorLabel}>{label}</Text>
          {required && <Text style={styles.requiredBadge}>Requerido</Text>}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          <TouchableOpacity
            style={[styles.chip, !selectedValue && styles.chipSelected]}
            onPress={() => onSelect('')}
          >
            <Text style={[styles.chipText, !selectedValue && styles.chipTextSelected]}>Ninguna</Text>
          </TouchableOpacity>
          {headers.map((h, idx) => {
            const isSelected = selectedValue === h;
            return (
              <TouchableOpacity
                key={`hdr-${idx}-${h}`}
                style={[styles.chip, isSelected && styles.chipSelected]}
                onPress={() => onSelect(h)}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{h}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  };

  const isFormValid = previewResult ? previewResult.isValid : false;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleContainer}>
            <Ionicons name="git-branch-outline" size={20} color="#6366f1" style={styles.headerIcon} />
            <Text style={styles.headerTitle}>Mapeo Manual de Columnas</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={22} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {fileName ? (
          <View style={styles.fileBar}>
            <Ionicons name="document-text-outline" size={16} color="#94a3b8" />
            <Text style={styles.fileNameText} numberOfLines={1}>{fileName}</Text>
          </View>
        ) : null}

        <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
          {/* Plantillas guardadas */}
          {availableTemplates.length > 0 && (
            <View style={styles.templatesSection}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="bookmark-outline" size={16} color="#6366f1" />
                <Text style={styles.sectionTitle}>Plantillas Guardadas</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.templatesScroll}>
                {availableTemplates.map((tpl) => (
                  <TouchableOpacity
                    key={tpl.id}
                    style={styles.templateCard}
                    onPress={() => applyTemplate(tpl)}
                  >
                    <Ionicons name="copy-outline" size={14} color="#a5b4fc" style={{ marginRight: 6 }} />
                    <Text style={styles.templateCardText}>{tpl.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Selector de Modo de Importe */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionCardTitle}>Estructura de Montos</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, amountMode === 'SINGLE' && styles.toggleBtnActive]}
                onPress={() => setAmountMode('SINGLE')}
              >
                <Ionicons
                  name="cash-outline"
                  size={16}
                  color={amountMode === 'SINGLE' ? '#ffffff' : '#94a3b8'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.toggleBtnText, amountMode === 'SINGLE' && styles.toggleBtnTextActive]}>
                  Columna Única de Monto
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toggleBtn, amountMode === 'SPLIT' && styles.toggleBtnActive]}
                onPress={() => setAmountMode('SPLIT')}
              >
                <Ionicons
                  name="swap-horizontal-outline"
                  size={16}
                  color={amountMode === 'SPLIT' ? '#ffffff' : '#94a3b8'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.toggleBtnText, amountMode === 'SPLIT' && styles.toggleBtnTextActive]}>
                  Cargo y Abono Separados
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Configuración de Campos */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionCardTitle}>Asignación de Columnas</Text>

            {/* Fecha */}
            {renderDropdownSelector('Fecha de Operación', dateColumn, setDateColumn, true)}

            {/* Monto según el modo */}
            {amountMode === 'SINGLE' ? (
              renderDropdownSelector('Importe / Monto', amountColumn, setAmountColumn, true)
            ) : (
              <>
                {renderDropdownSelector('Columna de Cargos (Gastos)', chargeColumn, setChargeColumn)}
                {renderDropdownSelector('Columna de Abonos (Ingresos)', creditColumn, setCreditColumn)}
              </>
            )}

            {/* Concepto / Descripción */}
            {renderDropdownSelector('Concepto / Descripción', descriptionColumn, setDescriptionColumn, true)}

            {/* Comercio opcional */}
            {renderDropdownSelector('Comercio o Establecimiento', merchantColumn, setMerchantColumn)}

            {/* Tipo opcional */}
            {renderDropdownSelector('Tipo de Movimiento', typeColumn, setTypeColumn)}

            {/* Divisa opcional */}
            {renderDropdownSelector('Divisa / Moneda', currencyColumn, setCurrencyColumn)}

            {/* Referencia opcional */}
            {renderDropdownSelector('Referencia / Folio', referenceColumn, setReferenceColumn)}
          </View>

          {/* Previsualización en Tiempo Real */}
          <View style={styles.sectionCard}>
            <View style={styles.previewHeader}>
              <View style={styles.previewTitleContainer}>
                <Ionicons name="eye-outline" size={16} color="#6366f1" />
                <Text style={styles.sectionCardTitle}>Previsualización en Tiempo Real</Text>
              </View>
              {previewResult && (
                <View
                  style={[
                    styles.validationBadge,
                    previewResult.isValid ? styles.validationBadgeSuccess : styles.validationBadgeError,
                  ]}
                >
                  <Ionicons
                    name={previewResult.isValid ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                    size={14}
                    color={previewResult.isValid ? '#10b981' : '#ef4444'}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={[
                      styles.validationBadgeText,
                      previewResult.isValid ? styles.validationTextSuccess : styles.validationTextError,
                    ]}
                  >
                    {previewResult.isValid ? 'Configuración válida' : 'Faltan campos'}
                  </Text>
                </View>
              )}
            </View>

            {previewResult && previewResult.previewRows.length > 0 ? (
              <View style={styles.previewRowsContainer}>
                {previewResult.previewRows.map((row) => (
                  <View
                    key={`preview-${row.rowIndex}`}
                    style={[styles.previewRowCard, !row.isValid && styles.previewRowCardError]}
                  >
                    <View style={styles.previewRowHeader}>
                      <Text style={styles.previewRowIndex}>Fila {row.rowIndex}</Text>
                      <View
                        style={[
                          styles.typeBadge,
                          row.type === 'INCOME'
                            ? styles.typeBadgeIncome
                            : row.type === 'TRANSFER'
                            ? styles.typeBadgeTransfer
                            : styles.typeBadgeExpense,
                        ]}
                      >
                        <Text style={styles.typeBadgeText}>{row.type}</Text>
                      </View>
                    </View>

                    <View style={styles.previewDataGrid}>
                      <View style={styles.previewDataCol}>
                        <Text style={styles.dataLabel}>Fecha</Text>
                        <Text style={styles.dataValue}>{row.formattedDate}</Text>
                      </View>
                      <View style={styles.previewDataCol}>
                        <Text style={styles.dataLabel}>Importe</Text>
                        <Text
                          style={[
                            styles.dataValue,
                            row.type === 'INCOME' ? styles.amountIncome : styles.amountExpense,
                          ]}
                        >
                          {row.amount !== null
                            ? `${row.currency} $${row.amount.toFixed(2)}`
                            : 'No disponible'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.previewDataColFull}>
                      <Text style={styles.dataLabel}>Concepto / Comercio</Text>
                      <Text style={styles.dataValue} numberOfLines={1}>
                        {row.merchant ? `${row.merchant} (${row.description})` : row.description || '—'}
                      </Text>
                    </View>

                    {!row.isValid && row.validationError && (
                      <View style={styles.rowErrorContainer}>
                        <Ionicons name="information-circle-outline" size={14} color="#ef4444" />
                        <Text style={styles.rowErrorText}>{row.validationError}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyPreviewText}>
                Seleccione las columnas obligatorias (Fecha, Importe y Concepto) para ver la interpretación de los datos.
              </Text>
            )}
          </View>

          {/* Guardar como plantilla */}
          <View style={styles.sectionCard}>
            <View style={styles.switchRow}>
              <View style={styles.switchLabelContainer}>
                <Text style={styles.switchLabel}>Guardar como plantilla reutilizable</Text>
                <Text style={styles.switchSubLabel}>
                  Permite aplicar automáticamente este mapeo a futuros archivos de este formato.
                </Text>
              </View>
              <Switch
                value={saveAsTemplate}
                onValueChange={setSaveAsTemplate}
                trackColor={{ false: '#334155', true: '#6366f1' }}
                thumbColor={saveAsTemplate ? '#ffffff' : '#94a3b8'}
              />
            </View>

            {saveAsTemplate && (
              <View style={styles.templateInputContainer}>
                <Text style={styles.inputLabel}>Nombre de la plantilla</Text>
                <TextInput
                  style={styles.templateInput}
                  placeholder="Ej. Extracto Santander Débito, Nómina BBVA"
                  placeholderTextColor="#64748b"
                  value={templateName}
                  onChangeText={setTemplateName}
                />
              </View>
            )}
          </View>
        </ScrollView>

        {/* Footer Actions */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancelar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.applyBtn, !isFormValid && styles.applyBtnDisabled]}
            disabled={!isFormValid}
            onPress={handleApply}
          >
            <Ionicons name="checkmark-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.applyBtnText}>Aplicar y Procesar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 54,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f8fafc',
  },
  closeButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  fileBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  fileNameText: {
    fontSize: 13,
    color: '#cbd5e1',
    marginLeft: 8,
    fontWeight: '500',
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  templatesSection: {
    marginBottom: 16,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#cbd5e1',
    marginLeft: 8,
  },
  templatesScroll: {
    flexDirection: 'row',
  },
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#312e81',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#4338ca',
  },
  templateCardText: {
    fontSize: 13,
    color: '#e0e7ff',
    fontWeight: '500',
  },
  sectionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  sectionCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
  },
  toggleBtnActive: {
    backgroundColor: '#4f46e5',
    borderColor: '#6366f1',
  },
  toggleBtnText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  toggleBtnTextActive: {
    color: '#ffffff',
  },
  selectorGroup: {
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  selectorLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  requiredBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#818cf8',
    backgroundColor: '#312e81',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  chipsScroll: {
    flexDirection: 'row',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    marginRight: 8,
  },
  chipSelected: {
    backgroundColor: '#6366f1',
    borderColor: '#818cf8',
  },
  chipText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  chipTextSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  previewTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  validationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  validationBadgeSuccess: {
    backgroundColor: '#064e3b',
  },
  validationBadgeError: {
    backgroundColor: '#7f1d1d',
  },
  validationBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  validationTextSuccess: {
    color: '#34d399',
  },
  validationTextError: {
    color: '#f87171',
  },
  previewRowsContainer: {
    gap: 10,
  },
  previewRowCard: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  previewRowCardError: {
    borderColor: '#ef4444',
  },
  previewRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  previewRowIndex: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeExpense: {
    backgroundColor: '#450a0a',
  },
  typeBadgeIncome: {
    backgroundColor: '#064e3b',
  },
  typeBadgeTransfer: {
    backgroundColor: '#1e1b4b',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#f8fafc',
  },
  previewDataGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  previewDataCol: {
    flex: 1,
  },
  previewDataColFull: {
    marginTop: 2,
  },
  dataLabel: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 2,
  },
  dataValue: {
    fontSize: 13,
    color: '#e2e8f0',
    fontWeight: '500',
  },
  amountExpense: {
    color: '#f87171',
    fontWeight: '700',
  },
  amountIncome: {
    color: '#34d399',
    fontWeight: '700',
  },
  rowErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  rowErrorText: {
    fontSize: 11,
    color: '#f87171',
  },
  emptyPreviewText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 16,
    lineHeight: 18,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabelContainer: {
    flex: 1,
    marginRight: 12,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f8fafc',
  },
  switchSubLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  templateInputContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#cbd5e1',
    marginBottom: 6,
  },
  templateInput: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#cbd5e1',
  },
  applyBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnDisabled: {
    backgroundColor: '#334155',
    opacity: 0.6,
  },
  applyBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
});
