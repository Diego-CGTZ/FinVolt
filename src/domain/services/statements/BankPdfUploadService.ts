/**
 * US-037: Servicio de Carga de Estados de Cuenta Bancarios en PDF
 *
 * Criterios de Aceptación:
 * 1. Upload seguro: Validación criptográfica (SHA-256), verificación de cabecera (%PDF-),
 *    sanitización de nombre y almacenamiento particionado.
 * 2. Archivo asociado al usuario: Vinculación estricta y aislamiento por userId.
 * 3. Raw source identificada: Registro formal de RawEvent con source = 'BANK_PDF' y status = 'PENDING'.
 * 4. Validación de tipo/tamaño: Límite de 20 MB y verificación de extensión/MIME.
 *
 * INVARIANTE ESTRICTA:
 * NUNCA inserta directamente en el modelo/tabla `Transaction`.
 */

import type { RawEvent } from '../../models/RawEvent';
import type { IRawEventRepository } from '../../repositories/IRawEventRepository';
import type {
  IBankStatementStorageService,
  StoredStatementFile,
} from '../../interfaces/IBankStatementStorageService';
import {
  BankPdfValidator,
  type PdfValidationOptions,
} from './BankPdfValidator';

export interface UploadBankPdfInput {
  userId: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType?: string;
  content: Uint8Array | string;
  sha256?: string;
  bankHint?: string;
}

export interface UploadBankPdfResult {
  rawEvent: RawEvent | null;
  storedFile: StoredStatementFile | null;
  status: 'SUCCESS' | 'REJECTED' | 'DUPLICATE';
  validationErrors?: string[];
  message: string;
}

export interface BankPdfUploadServiceOptions {
  rawEventRepository: IRawEventRepository;
  storageService: IBankStatementStorageService;
  validationOptions?: PdfValidationOptions;
}

export class BankPdfUploadService {
  private readonly rawEventRepository: IRawEventRepository;
  private readonly storageService: IBankStatementStorageService;
  private readonly validationOptions?: PdfValidationOptions;

  constructor(options: BankPdfUploadServiceOptions) {
    this.rawEventRepository = options.rawEventRepository;
    this.storageService = options.storageService;
    this.validationOptions = options.validationOptions;
  }

  /**
   * Procesa de extremo a extremo la carga segura de un estado de cuenta en formato PDF.
   */
  public async uploadStatement(input: UploadBankPdfInput): Promise<UploadBankPdfResult> {
    // 1. Verificación de usuario
    if (!input.userId || typeof input.userId !== 'string' || input.userId.trim() === '') {
      return {
        rawEvent: null,
        storedFile: null,
        status: 'REJECTED',
        validationErrors: ['El identificador de usuario (userId) es obligatorio.'],
        message: 'No se puede asociar la carga: usuario no autenticado o no proporcionado.',
      };
    }

    const userId = input.userId.trim();

    // 2. Validación exhaustiva de tipo, tamaño, extensión y magic bytes
    const validation = BankPdfValidator.validate(
      {
        fileName: input.fileName,
        fileSizeBytes: input.fileSizeBytes,
        mimeType: input.mimeType || 'application/pdf',
        content: input.content,
        sha256: input.sha256,
      },
      this.validationOptions,
    );

    if (!validation.isValid) {
      return {
        rawEvent: null,
        storedFile: null,
        status: 'REJECTED',
        validationErrors: validation.errors,
        message: `Archivo rechazado por validación de seguridad: ${validation.errors.join('; ')}`,
      };
    }

    const { sanitizedFileName, sha256 } = validation;
    const detectedBank = input.bankHint || validation.detectedBank;

    // 3. Verificación de duplicados previos por hash SHA-256 para este usuario
    const existingEvents = await this.rawEventRepository.getEvents({
      source: 'BANK_PDF',
    });

    const duplicateEvent = existingEvents.find(
      (ev) => ev.userId === userId && ev.sourceId === sha256,
    );

    if (duplicateEvent) {
      return {
        rawEvent: duplicateEvent,
        storedFile: null,
        status: 'DUPLICATE',
        message: `El archivo "${sanitizedFileName}" (SHA-256: ${sha256.slice(0, 8)}...) ya fue cargado previamente por el usuario.`,
      };
    }

    // 4. Carga segura en el servicio de almacenamiento particionado
    let storedFile: StoredStatementFile;
    try {
      storedFile = await this.storageService.upload({
        userId,
        fileName: sanitizedFileName,
        fileBuffer: input.content,
        mimeType: input.mimeType || 'application/pdf',
        sha256,
      });
    } catch (storageErr) {
      const errorMsg = storageErr instanceof Error ? storageErr.message : String(storageErr);
      return {
        rawEvent: null,
        storedFile: null,
        status: 'REJECTED',
        validationErrors: [errorMsg],
        message: `Fallo durante el almacenamiento seguro del archivo: ${errorMsg}`,
      };
    }

    // 5. Registro formal de RawEvent canónico inmutable (US-018 / US-037)
    const now = new Date();
    const rawEvent = await this.rawEventRepository.save({
      source: 'BANK_PDF',
      sourceId: sha256,
      payload: {
        userId,
        fileName: sanitizedFileName,
        originalFileName: input.fileName,
        fileSizeBytes: validation.fileSizeBytes,
        sha256,
        storageBucket: storedFile.bucket,
        storagePath: storedFile.storagePath,
        mimeType: storedFile.mimeType,
        bankDetected: detectedBank,
        uploadedAt: now.toISOString(),
      },
      rawText: undefined, // El texto se extraerá en US-038
      metadata: {
        userId,
        fileName: sanitizedFileName,
        fileSizeBytes: validation.fileSizeBytes,
        bankDetected: detectedBank,
        origin: 'BankPdfUpload',
        storagePath: storedFile.storagePath,
      },
      receivedAt: now,
    });

    return {
      rawEvent,
      storedFile,
      status: 'SUCCESS',
      message: `Estado de cuenta "${sanitizedFileName}" cargado y registrado exitosamente con fuente BANK_PDF.`,
    };
  }
}
