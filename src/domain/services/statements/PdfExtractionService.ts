/**
 * US-038: Servicio de Extracción de Texto y Tablas de Estados de Cuenta PDF
 *
 * Criterios de Aceptación:
 * 1. Texto extraído (páginas, líneas, texto consolidado).
 * 2. Tablas identificables cuando sea posible (filas, columnas, importes, fechas).
 * 3. Errores manejados (PDF corrupto, escaneado o protegido).
 * 4. Documento original conservado.
 *
 * INVARIANTE ESTRICTA:
 * NUNCA inserta directamente en la tabla/modelo `Transaction`.
 */

import type { RawEvent } from '../../models/RawEvent';
import type { IRawEventRepository } from '../../repositories/IRawEventRepository';
import type {
  IPdfTextExtractor,
  PdfExtractionResult,
} from '../../interfaces/IPdfTextExtractor';
import { PdfStreamTextDecoder } from './PdfStreamTextDecoder';
import { PdfTableDetector } from './PdfTableDetector';
import { BankPdfValidator } from './BankPdfValidator';

export interface ProcessPdfEventResult {
  rawEvent: RawEvent;
  extraction: PdfExtractionResult;
  status: 'SUCCESS' | 'NO_TEXT_FOUND' | 'ENCRYPTED' | 'FAILED';
  message: string;
}

export class PdfExtractionService implements IPdfTextExtractor {
  constructor(private readonly rawEventRepository?: IRawEventRepository) {}

  /**
   * Extrae el texto y las tablas de un documento PDF binario o string.
   */
  public async extractText(content: Uint8Array | string): Promise<PdfExtractionResult> {
    try {
      if (!content || (content instanceof Uint8Array && content.length === 0)) {
        return {
          success: false,
          rawText: '',
          totalPages: 0,
          pages: [],
          tables: [],
          metadata: {
            pagesCount: 0,
            tablesCount: 0,
            totalRowsDetected: 0,
            hasSearchableText: false,
          },
          errorMessage: 'El documento PDF está vacío o no contiene datos binarios.',
        };
      }

      // 1. Decodificar operadores de texto y streams
      const decoded = PdfStreamTextDecoder.decode(content);

      if (decoded.isEncrypted) {
        return {
          success: false,
          rawText: '',
          totalPages: 0,
          pages: [],
          tables: [],
          metadata: {
            isEncrypted: true,
            hasSearchableText: false,
            pagesCount: 0,
            tablesCount: 0,
            totalRowsDetected: 0,
          },
          errorMessage: 'El archivo PDF está protegido con contraseña o cifrado.',
        };
      }

      // 2. Detección de tablas estructuradas
      const tables = decoded.rawText ? PdfTableDetector.detectTables(decoded.rawText) : [];
      const totalRowsDetected = tables.reduce((acc, t) => acc + t.rows.length, 0);

      // 3. Detección de banco a partir del texto extraído
      const bankDetected = decoded.rawText
        ? BankPdfValidator.detectBankHint('', decoded.rawText)
        : 'UNKNOWN';

      const metadata = {
        producer: decoded.metadata.producer,
        creationDate: decoded.metadata.creationDate,
        isEncrypted: false,
        hasSearchableText: decoded.hasSearchableText,
        bankDetected,
        pagesCount: decoded.pages.length,
        tablesCount: tables.length,
        totalRowsDetected,
      };

      return {
        success: decoded.hasSearchableText,
        rawText: decoded.rawText,
        totalPages: decoded.pages.length,
        pages: decoded.pages,
        tables,
        metadata,
        errorMessage: decoded.hasSearchableText
          ? undefined
          : 'No se detectó texto seleccionable en el PDF (documento escaneado o imagen pura). Se requiere OCR.',
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        rawText: '',
        totalPages: 0,
        pages: [],
        tables: [],
        metadata: {
          pagesCount: 0,
          tablesCount: 0,
          totalRowsDetected: 0,
          hasSearchableText: false,
        },
        errorMessage: `Error inesperado durante la extracción de texto del PDF: ${errMsg}`,
      };
    }
  }

  /**
   * Procesa un RawEvent de tipo BANK_PDF:
   * Extrae el texto, detecta tablas y actualiza el RawEvent conservando el payload original intacto.
   */
  public async processRawEvent(
    rawEvent: RawEvent,
    fileBuffer?: Uint8Array | string,
  ): Promise<ProcessPdfEventResult> {
    if (!this.rawEventRepository) {
      throw new Error('IRawEventRepository no fue provisto al instanciar PdfExtractionService.');
    }

    // 1. Obtener contenido del PDF
    const content =
      fileBuffer ||
      (rawEvent.payload?.fileContent as Uint8Array | string) ||
      (rawEvent.payload?.base64 as string) ||
      rawEvent.rawText ||
      '';

    // 2. Extraer texto y tablas
    const extraction = await this.extractText(content);

    // 3. Invariante: Conservar documento original y payload íntegro
    const originalPayload = { ...rawEvent.payload };
    const enrichedMetadata = {
      ...rawEvent.metadata,
      extractedPagesCount: extraction.totalPages,
      extractedTablesCount: extraction.tables.length,
      totalRowsDetected: extraction.metadata.totalRowsDetected,
      hasSearchableText: extraction.metadata.hasSearchableText,
      bankDetected: extraction.metadata.bankDetected || rawEvent.metadata?.bankDetected,
      extractedTables: extraction.tables,
    };

    if (extraction.metadata.isEncrypted) {
      const updated = await this.rawEventRepository.updateStatus(rawEvent.id, {
        status: 'FAILED',
        errorMessage: extraction.errorMessage,
        processedAt: new Date(),
      });
      return {
        rawEvent: { ...updated, payload: originalPayload, metadata: enrichedMetadata },
        extraction,
        status: 'ENCRYPTED',
        message: 'Extracción detenida: el archivo PDF está encriptado con contraseña.',
      };
    }

    if (!extraction.metadata.hasSearchableText) {
      // Documento escaneado sin texto (requiere OCR en US-059)
      const updated = await this.rawEventRepository.updateStatus(rawEvent.id, {
        status: 'FAILED',
        errorMessage: extraction.errorMessage,
        processedAt: new Date(),
      });
      return {
        rawEvent: { ...updated, payload: originalPayload, metadata: enrichedMetadata },
        extraction,
        status: 'NO_TEXT_FOUND',
        message: 'No se detectó texto en el PDF. Se requiere procesamiento OCR posterior.',
      };
    }

    // 4. Extracción exitosa: Guardar rawText en RawEvent conservando PENDING para el parser (US-039)
    const updated = await this.rawEventRepository.updateStatus(rawEvent.id, {
      status: 'PENDING',
      processedAt: new Date(),
    });

    // Retornar el evento enriquecido con su rawText
    const finalEvent: RawEvent = {
      ...updated,
      payload: originalPayload,
      rawText: extraction.rawText,
      metadata: enrichedMetadata,
    };

    return {
      rawEvent: finalEvent,
      extraction,
      status: 'SUCCESS',
      message: `Extracción exitosa: ${extraction.totalPages} página(s), ${extraction.tables.length} tabla(s) y ${extraction.metadata.totalRowsDetected} movimiento(s) detectados.`,
    };
  }
}
