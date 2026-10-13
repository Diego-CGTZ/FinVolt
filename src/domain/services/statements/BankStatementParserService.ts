/**
 * US-039: Orquestador y Servicio de Parseo de Estados de Cuenta Bancarios
 *
 * Acceptance Criteria:
 * 1. Parser específico por banco (BBVA, Santander, Banorte, Nu, AMEX, Fallback genérico).
 * 2. Extrae fecha, monto, descripción y tipo contable.
 * 3. Genera TransactionCandidates con fingerprint determinístico y confianza.
 * 4. Conserva fuente original (RawEvent con source = 'BANK_PDF' y rawPayload inmutable).
 *
 * INVARIANTE ESTRICTA DE DOMINIO:
 * NUNCA inserta directamente en el modelo o tabla Transaction.
 */

import type { RawEvent } from '../../models/RawEvent';
import type { ITransactionCandidateRepository } from '../../repositories/ITransactionCandidateRepository';
import type { IRawEventRepository } from '../../repositories/IRawEventRepository';
import type {
  BankStatementParseResult,
  IBankStatementParser,
} from '../../interfaces/IBankStatementParser';
import type { PdfExtractionResult } from '../../interfaces/IPdfTextExtractor';
import { PdfExtractionService } from './PdfExtractionService';
import { BankPdfValidator } from './BankPdfValidator';
import {
  BBVAStatementParser,
  SantanderStatementParser,
  BanorteStatementParser,
  NuStatementParser,
  AmexStatementParser,
  GenericStatementParser,
} from './parsers';

export interface BankStatementParserServiceOptions {
  parsers?: IBankStatementParser[];
  candidateRepository?: ITransactionCandidateRepository;
  rawEventRepository?: IRawEventRepository;
  extractionService?: PdfExtractionService;
}

export class BankStatementParserService {
  private readonly parsers: IBankStatementParser[];
  private readonly candidateRepository?: ITransactionCandidateRepository;
  private readonly rawEventRepository?: IRawEventRepository;
  private readonly extractionService: PdfExtractionService;

  constructor(options?: BankStatementParserServiceOptions) {
    this.candidateRepository = options?.candidateRepository;
    this.rawEventRepository = options?.rawEventRepository;
    this.extractionService = options?.extractionService || new PdfExtractionService(options?.rawEventRepository);

    this.parsers = options?.parsers && options.parsers.length > 0
      ? options.parsers
      : [
          new BBVAStatementParser(),
          new SantanderStatementParser(),
          new BanorteStatementParser(),
          new NuStatementParser(),
          new AmexStatementParser(),
          new GenericStatementParser(),
        ];
  }

  /**
   * Obtiene la lista de parsers registrados en el servicio.
   */
  public getRegisteredParsers(): IBankStatementParser[] {
    return [...this.parsers];
  }

  /**
   * Resuelve el parser adecuado evaluando las pistas de banco y el texto extraído.
   */
  public resolveParser(
    bankHint: string,
    rawText: string,
    tables?: PdfExtractionResult['tables'],
  ): IBankStatementParser {
    // 1. Buscar entre los parsers específicos (excluyendo el genérico inicialmente)
    const specificParsers = this.parsers.filter((p) => p.bankCode !== 'GENERIC');
    for (const parser of specificParsers) {
      if (parser.canParse(bankHint, rawText, tables)) {
        return parser;
      }
    }

    // 2. Fallback al parser genérico
    const genericParser = this.parsers.find((p) => p.bankCode === 'GENERIC');
    return genericParser || new GenericStatementParser();
  }

  /**
   * Procesa un RawEvent de estado de cuenta bancario y genera los candidatos de transacción.
   */
  public async parseStatementEvent(
    rawEvent: RawEvent,
    pdfBinaryContent?: Uint8Array | string,
    userId?: string,
  ): Promise<BankStatementParseResult> {
    const ownerUserId = userId || rawEvent.userId;

    // 1. Extraer texto y tablas si no están disponibles o si se proporciona contenido binario
    let extraction: PdfExtractionResult;
    const existingTables = rawEvent.metadata?.tables as PdfExtractionResult['tables'] | undefined;

    if (rawEvent.rawText && existingTables) {
      extraction = {
        success: true,
        rawText: rawEvent.rawText,
        totalPages: (rawEvent.metadata?.totalPages as number) || 1,
        pages: [],
        tables: existingTables,
        metadata: {
          isEncrypted: false,
          hasSearchableText: true,
          bankDetected: (rawEvent.metadata?.bankDetected as string) || 'UNKNOWN',
          pagesCount: 1,
          tablesCount: existingTables.length,
          totalRowsDetected: existingTables.reduce((acc, t) => acc + t.rows.length, 0),
        },
      };
    } else {
      const contentToExtract =
        pdfBinaryContent ||
        (rawEvent.payload?.base64Content as string) ||
        rawEvent.rawText ||
        '';

      extraction = await this.extractionService.extractText(contentToExtract);

      // Enriquecer el evento con los metadatos extraídos
      if (extraction.success) {
        rawEvent.metadata = {
          ...(rawEvent.metadata || {}),
          extractedPagesCount: extraction.totalPages,
          extractedTablesCount: extraction.tables.length,
          bankDetected: extraction.metadata.bankDetected || rawEvent.metadata?.bankDetected,
        };
      }
    }

    // 2. Detección de institución bancaria
    const payloadHint = (rawEvent.payload?.bankHint as string) || (rawEvent.payload?.detectedBank as string) || '';
    const metadataHint = (rawEvent.metadata?.bankDetected as string) || (rawEvent.metadata?.bankHint as string) || '';
    const fileName = (rawEvent.payload?.fileName as string) || (rawEvent.metadata?.fileName as string) || '';

    const detectedBank = BankPdfValidator.detectBankHint(
      fileName || payloadHint || metadataHint,
      extraction.rawText,
    );

    // 3. Resolución del parser adecuado
    const selectedParser = this.resolveParser(
      detectedBank,
      extraction.rawText,
      extraction.tables,
    );

    // 4. Parseo y generación de TransactionCandidates
    const parseResult = await selectedParser.parse(rawEvent, extraction, ownerUserId);

    // 5. Persistencia opcional de candidatos en el repositorio
    if (this.candidateRepository && parseResult.candidates.length > 0) {
      for (const candidate of parseResult.candidates) {
        try {
          await this.candidateRepository.save(candidate);
        } catch {
          // Si el repositorio no soporta save directo o es solo lectura
        }
      }
    }

    // 6. Actualizar metadatos en RawEvent y marcar como PROCESSED si hay repositorio
    rawEvent.metadata = {
      ...(rawEvent.metadata || {}),
      statementParsed: true,
      parserUsed: selectedParser.bankCode,
      candidatesGenerated: parseResult.candidatesGenerated,
      rawRowsProcessed: parseResult.rawRowsProcessed,
      accountHint: parseResult.accountHint,
    };

    if (this.rawEventRepository) {
      await this.rawEventRepository.updateStatus(rawEvent.id, {
        status: parseResult.candidatesGenerated > 0 ? 'PROCESSED' : rawEvent.status,
        processedAt: new Date(),
      });
    }

    return parseResult;
  }
}
