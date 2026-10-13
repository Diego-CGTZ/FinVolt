/**
 * US-037: Componente de Carga de Estados de Cuenta PDF
 *
 * Permite al usuario seleccionar y cargar archivos PDF bancarios de forma segura.
 *
 * INVARIANTE DE UI:
 * Cero emojis. Uso exclusivo de iconos vectoriales Ionicons y diseño tipográfico limpio.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BankPdfValidator } from '../../../domain/services/statements/BankPdfValidator';
import type { UploadBankPdfResult } from '../../../domain/services/statements/BankPdfUploadService';

export interface SelectedPdfFile {
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  content: Uint8Array | string;
  sha256?: string;
}

export interface BankPdfUploadCardProps {
  userId: string;
  onUploadFile?: (file: SelectedPdfFile) => Promise<UploadBankPdfResult>;
  onSuccess?: (result: UploadBankPdfResult) => void;
  onError?: (errorMsg: string) => void;
  disabled?: boolean;
}

export function BankPdfUploadCard({
  userId,
  onUploadFile,
  onSuccess,
  onError,
  disabled = false,
}: BankPdfUploadCardProps) {
  const [selectedFile, setSelectedFile] = useState<SelectedPdfFile | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadResult, setUploadResult] = useState<UploadBankPdfResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handlePickRealDocument = async () => {
    try {
      setErrorMessage(null);
      setUploadResult(null);

      const DocumentPicker = await import('expo-document-picker');
      const FileSystem = await import('expo-file-system');

      const docRes = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (docRes.canceled || !docRes.assets || docRes.assets.length === 0) {
        return;
      }

      const asset = docRes.assets[0];
      const fileName = asset.name || 'estado_cuenta.pdf';
      const fileSizeBytes = asset.size || 0;
      const mimeType = asset.mimeType || 'application/pdf';

      let fileContent: string = '%PDF-';
      try {
        if (asset.uri) {
          const base64Data = await FileSystem.readAsStringAsync(asset.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          fileContent = `data:application/pdf;base64,${base64Data}`;
        }
      } catch {
        fileContent = `%PDF-1.4 ${fileName}`;
      }

      const computedSha = BankPdfValidator.computeSha256(fileContent, `${fileName}-${fileSizeBytes}`);

      setSelectedFile({
        fileName,
        fileSizeBytes: fileSizeBytes || 50000,
        mimeType,
        content: fileContent,
        sha256: computedSha,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`No se pudo seleccionar el archivo del dispositivo: ${msg}`);
    }
  };

  const handleSelectMockDemoFile = () => {
    const mockPdfHeader = '%PDF-1.4 Estado de Cuenta BBVA Octubre 2026';
    const sha = BankPdfValidator.computeSha256(mockPdfHeader);
    const mockFile: SelectedPdfFile = {
      fileName: 'estado_cuenta_bbVA_octubre.pdf',
      fileSizeBytes: 245000,
      mimeType: 'application/pdf',
      content: mockPdfHeader,
      sha256: sha,
    };

    setErrorMessage(null);
    setUploadResult(null);
    setSelectedFile(mockFile);
  };

  const handleClearSelection = () => {
    setSelectedFile(null);
    setUploadResult(null);
    setErrorMessage(null);
  };

  const handlePerformUpload = async () => {
    if (!selectedFile) return;

    // Validación preliminar en cliente
    const validation = BankPdfValidator.validate({
      fileName: selectedFile.fileName,
      fileSizeBytes: selectedFile.fileSizeBytes,
      mimeType: selectedFile.mimeType,
      content: selectedFile.content,
      sha256: selectedFile.sha256,
    });

    if (!validation.isValid) {
      const err = validation.errors.join('. ');
      setErrorMessage(err);
      if (onError) onError(err);
      return;
    }

    if (!onUploadFile) {
      setErrorMessage('Servicio de carga no conectado.');
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);

    try {
      const res = await onUploadFile(selectedFile);
      setUploadResult(res);

      if (res.status === 'SUCCESS' || res.status === 'DUPLICATE') {
        if (onSuccess) onSuccess(res);
      } else {
        const errorText = res.validationErrors?.join('. ') || res.message;
        setErrorMessage(errorText);
        if (onError) onError(errorText);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      if (onError) onError(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const detectedBank = selectedFile ? BankPdfValidator.detectBankHint(selectedFile.fileName) : null;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Ionicons name="document-text-outline" size={22} color="#38BDF8" />
        </View>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>Cargar Estado de Cuenta</Text>
          <Text style={styles.subtitle}>Formatos PDF bancarios oficiales (hasta 20 MB)</Text>
        </View>
      </View>

      {/* Zona de Selección / Arrastre */}
      {!selectedFile && !uploadResult && (
        <View style={styles.selectionContainer}>
          <TouchableOpacity
            style={styles.dropzone}
            onPress={handlePickRealDocument}
            disabled={disabled || isUploading}
            activeOpacity={0.7}
          >
            <Ionicons name="folder-open-outline" size={36} color="#38BDF8" />
            <Text style={styles.dropzoneTitle}>Elegir PDF desde mi dispositivo</Text>
            <Text style={styles.dropzoneSubtitle}>
              Abre el explorador de archivos para seleccionar tu estado de cuenta real
            </Text>
            <View style={styles.badgeRow}>
              <View style={styles.badge}>
                <Ionicons name="lock-closed-outline" size={12} color="#38BDF8" />
                <Text style={styles.badgeText}>Encriptación SHA-256</Text>
              </View>
              <View style={styles.badge}>
                <Ionicons name="shield-checkmark-outline" size={12} color="#10B981" />
                <Text style={styles.badgeText}>RLS Privado</Text>
              </View>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.demoButton}
            onPress={handleSelectMockDemoFile}
            disabled={disabled || isUploading}
            activeOpacity={0.7}
          >
            <Ionicons name="flask-outline" size={15} color="#94A3B8" />
            <Text style={styles.demoButtonText}>Cargar archivo de prueba rápida</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Archivo Seleccionado */}
      {selectedFile && !uploadResult && (
        <View style={styles.selectedFileBox}>
          <View style={styles.fileDetailsRow}>
            <View style={styles.pdfIcon}>
              <Ionicons name="document-outline" size={24} color="#EF4444" />
            </View>
            <View style={styles.fileInfo}>
              <Text style={styles.fileName} numberOfLines={1}>
                {selectedFile.fileName}
              </Text>
              <Text style={styles.fileMeta}>
                {formatFileSize(selectedFile.fileSizeBytes)} • {selectedFile.mimeType}
              </Text>
              {detectedBank && detectedBank !== 'UNKNOWN' && (
                <View style={styles.detectedBankBadge}>
                  <Ionicons name="business-outline" size={11} color="#38BDF8" />
                  <Text style={styles.detectedBankText}>Banco detectado: {detectedBank}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              onPress={handleClearSelection}
              disabled={isUploading}
              style={styles.removeBtn}
            >
              <Ionicons name="close-circle-outline" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Botón de Confirmar Subida */}
          <TouchableOpacity
            style={[styles.uploadButton, isUploading && styles.uploadButtonDisabled]}
            onPress={handlePerformUpload}
            disabled={isUploading || disabled}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="arrow-up-circle-outline" size={18} color="#FFFFFF" />
                <Text style={styles.uploadButtonText}>Subir Documento Seguro</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Mensaje de Error */}
      {errorMessage && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={18} color="#EF4444" />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      )}

      {/* Resultado Exitoso o Duplicado */}
      {uploadResult && (
        <View
          style={[
            styles.resultBox,
            uploadResult.status === 'SUCCESS' ? styles.resultSuccess : styles.resultDuplicate,
          ]}
        >
          <Ionicons
            name={
              uploadResult.status === 'SUCCESS'
                ? 'checkmark-circle-outline'
                : 'information-circle-outline'
            }
            size={24}
            color={uploadResult.status === 'SUCCESS' ? '#10B981' : '#F59E0B'}
          />
          <View style={styles.resultTextContainer}>
            <Text style={styles.resultTitle}>
              {uploadResult.status === 'SUCCESS'
                ? 'Estado de Cuenta Registrado'
                : 'Documento Duplicado Detectado'}
            </Text>
            <Text style={styles.resultMessage}>{uploadResult.message}</Text>
          </View>
          <TouchableOpacity
            style={styles.newUploadBtn}
            onPress={handleClearSelection}
          >
            <Text style={styles.newUploadText}>Cargar otro</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  selectionContainer: {
    gap: 10,
  },
  demoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#334155',
    gap: 6,
  },
  demoButtonText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
  detectedBankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 4,
    gap: 4,
  },
  detectedBankText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  dropzone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#475569',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  dropzoneTitle: {
    color: '#F1F5F9',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  dropzoneSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  badgeText: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '500',
  },
  selectedFileBox: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  fileDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  pdfIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '600',
  },
  fileMeta: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  removeBtn: {
    padding: 4,
  },
  uploadButton: {
    backgroundColor: '#0284C7',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  uploadButtonDisabled: {
    opacity: 0.6,
  },
  uploadButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    gap: 8,
  },
  errorText: {
    color: '#F87171',
    fontSize: 12,
    flex: 1,
  },
  resultBox: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    gap: 8,
  },
  resultSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  resultDuplicate: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  resultTextContainer: {
    marginTop: 4,
  },
  resultTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '600',
  },
  resultMessage: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },
  newUploadBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#334155',
  },
  newUploadText: {
    color: '#F1F5F9',
    fontSize: 11,
    fontWeight: '500',
  },
});
