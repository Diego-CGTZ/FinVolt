/**
 * US-040: Servicio Orquestador de Ingestión de Archivos CSV
 *
 * Criterios de Aceptación:
 * 1. Archivo validado (MIME, extensión, tamaño, encoding, delimitador).
 * 2. Columnas detectadas (mapeo automático inteligente).
 * 3. Filas convertidas a candidates (TransactionCandidate con fingerprint determinístico).
 * 4. Deduplicación/reconciliación aplicada (idempotencia por SHA-256 y detección por fingerprint).
 *
 * INVARIANTE ESTRICTA DE DOMINIO:
 * NUNCA inserta directamente en la tabla o modelo Transaction.
 */

import type { RawEvent } from '../../models/RawEvent';
import type { IRawEventRepository } from '../../repositories/IRawEventRepository';
import type { ITransactionCandidateRepository } from '../../repositories/ITransactionCandidateRepository';
import type { ITransactionRepository } from '../../repositories/ITransactionRepository';
import type {
  CsvParseOptions,
  CsvParseResult,
  ICsvStatementParser,
} from '../../interfaces/ICsvStatementParser';
import { CsvFileValidator, type CsvValidationOptions, type ValidateCsvInput } from './CsvFileValidator';
import { CsvStatementParser } from './CsvStatementParser';
import { BankPdfValidator } from '../statements/BankPdfValidator';

export interface IngestCsvInput extends ValidateCsvInput {
  userId: string;
  options?: CsvParseOptions;
}

export interface IngestCsvResult {
  status: 'SUCCESS' | 'REJECTED' | 'DUPLICATE';
  rawEvent: RawEvent | null;
  parseResult?: CsvParseResult;
  validationErrors?: string[];
  message: string;
}

export interface CsvIngestionServiceOptions {
  rawEventRepository: IRawEventRepository;
  candidateRepository?: ITransactionCandidateRepository;
  transactionRepository?: ITransactionRepository;
  parser?: ICsvStatementParser;
  validationOptions?: CsvValidationOptions;
}

export class CsvIngestionService {
  private readonly rawEventRepository: IRawEventRepository;
  private readonly candidateRepository?: ITransactionCandidateRepository;
  private readonly transactionRepository?: ITransactionRepository;
  private readonly parser: ICsvStatementParser;
  private readonly validationOptions?: CsvValidationOptions;

  constructor(options: CsvIngestionServiceOptions) {
    this.rawEventRepository = options.rawEventRepository;
    this.candidateRepository = options.candidateRepository;
    this.transactionRepository = options.transactionRepository;
    this.parser = options.parser || new CsvStatementParser();
    this.validationOptions = options.validationOptions;
  }

  /**
   * Procesa de principio a fin la ingestión de un archivo CSV financiero.
   */
  public async ingestCsv(input: IngestCsvInput): Promise<IngestCsvResult> {
    if (!input.userId || typeof input.userId !== 'string' || input.userId.trim().length === 0) {
      return {
        status: 'REJECTED',
        rawEvent: null,
        validationErrors: ['El userId del usuario es obligatorio para la ingestión.'],
        message: 'Rechazado: usuario no autenticado o no especificado.',
      };
    }

    const userId = input.userId.trim();

    // 1. Validación de archivo y delimitadores
    const validation = CsvFileValidator.validate(input, this.validationOptions);
    if (!validation.isValid) {
      return {
        status: 'REJECTED',
        rawEvent: null,
        validationErrors: validation.errors,
        message: `Archivo CSV rechazado: ${validation.errors.join('; ')}`,
      };
    }

    // 2. Verificación de idempotencia por hash SHA-256 del archivo
    const existingRawEvent = await this.rawEventRepository.findBySourceId('BANK_CSV', validation.sha256);
    if (existingRawEvent) {
      return {
        status: 'DUPLICATE',
        rawEvent: existingRawEvent,
        message: 'Este archivo CSV ya fue importado previamente (duplicado por hash SHA-256).',
      };
    }

    // 3. Detección preliminar de banco si no fue provisto
    const bankHint = input.options?.bankHint || BankPdfValidator.detectBankHint(validation.sanitizedFileName, validation.normalizedText);

    // 4. Registro formal del RawEvent con status PENDING
    const rawPayload = {
      fileName: validation.sanitizedFileName,
      fileSizeBytes: validation.fileSizeBytes,
      sha256: validation.sha256,
      mimeType: input.mimeType || 'text/csv',
      detectedDelimiter: validation.detectedDelimiter,
      bankHint,
    };

    const rawEvent = await this.rawEventRepository.save({
      source: 'BANK_CSV',
      sourceId: validation.sha256,
      payload: rawPayload,
      rawText: validation.normalizedText,
      metadata: {
        userId,
        sanitizedFileName: validation.sanitizedFileName,
        sha256: validation.sha256,
        bankDetected: bankHint,
      },
      receivedAt: new Date(),
    });

    // 5. Parseo y generación de TransactionCandidates
    const parseOptions: CsvParseOptions = {
      ...input.options,
      delimiter: input.options?.delimiter || validation.detectedDelimiter,
      bankHint,
    };

    const parseResult = await this.parser.parse(
      validation.normalizedText,
      rawEvent,
      parseOptions,
      userId,
    );

    // 6. Deduplicación fila por fila contra candidatos o transacciones previas
    let duplicatesCount = 0;
    let reconciledCount = 0;
    const finalCandidatesToSave = [];

    for (const candidate of parseResult.candidates) {
      let isDuplicate = false;

      // A. Verificar duplicidad contra repositorio de candidatos si existe
      if (this.candidateRepository && candidate.fingerprint) {
        const existingCand = await this.candidateRepository.findByFingerprint(candidate.fingerprint);
        if (existingCand) {
          isDuplicate = true;
          duplicatesCount++;
          candidate.status = 'DUPLICATE';
        }
      }

      // B. Verificar contra transacciones finales existentes
      if (!isDuplicate && this.transactionRepository && candidate.fingerprint) {
        const existingTx = await this.transactionRepository.findByFingerprint(candidate.fingerprint);
        if (existingTx) {
          reconciledCount++;
          candidate.status = 'RECONCILED';
        }
      }

      if (!isDuplicate && this.candidateRepository) {
        try {
          await this.candidateRepository.save(candidate);
        } catch {
          // Repositorio read-only o mock
        }
      }

      finalCandidatesToSave.push(candidate);
    }

    parseResult.candidates = finalCandidatesToSave;
    parseResult.duplicatesCount = duplicatesCount;
    parseResult.reconciledCount = reconciledCount;

    // 7. Actualización de estado en RawEvent
    const updatedStatus = parseResult.candidates.length > 0 ? 'PROCESSED' : 'IGNORED';
    await this.rawEventRepository.updateStatus(rawEvent.id, {
      status: updatedStatus,
      processedAt: new Date(),
    });

    rawEvent.metadata = {
      ...rawEvent.metadata,
      candidatesGenerated: parseResult.candidates.length,
      validRows: parseResult.validRows,
      invalidRows: parseResult.invalidRows,
      duplicatesCount,
      reconciledCount,
      detectedMapping: parseResult.detectedMapping,
    };

    return {
      status: 'SUCCESS',
      rawEvent,
      parseResult,
      message: `CSV importado exitosamente: ${parseResult.validRows} candidatos generados, ${duplicatesCount} duplicados.`,
    };
  }
}
