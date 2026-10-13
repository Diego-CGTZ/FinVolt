/**
 * US-038: Decodificador de Streams y Texto de Documentos PDF
 *
 * Implementa un extractor determinístico y autónomo de operadores de texto PDF (ISO 32000-1)
 * sin requerir binarios nativos de C++ pesados ni polyfills de navegador.
 */

import type { ExtractedPdfPage } from '../../interfaces/IPdfTextExtractor';

export interface DecodedPdfStreamData {
  rawText: string;
  pages: ExtractedPdfPage[];
  isEncrypted: boolean;
  hasSearchableText: boolean;
  metadata: {
    producer?: string;
    creationDate?: string;
  };
}

export class PdfStreamTextDecoder {
  /**
   * Convierte la entrada (Uint8Array, base64 data URI o string) en una cadena binaria legible.
   */
  public static normalizeContentToString(content: Uint8Array | string): string {
    if (!content) return '';

    if (content instanceof Uint8Array) {
      if (typeof TextDecoder !== 'undefined') {
        try {
          return new TextDecoder('latin1').decode(content);
        } catch {
          // Fallback a iteración directa
        }
      }
      let binary = '';
      const len = content.length;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(content[i]);
      }
      return binary;
    }

    if (typeof content === 'string') {
      const trimmed = content.trim();
      // Si viene como base64 data URI
      if (trimmed.startsWith('data:application/pdf;base64,')) {
        const b64 = trimmed.slice('data:application/pdf;base64,'.length);
        return this.decodeBase64ToString(b64);
      }

      // Si parece base64 puro (comienza con JVBERi0)
      if (trimmed.startsWith('JVBERi0') || trimmed.startsWith('JVBER')) {
        return this.decodeBase64ToString(trimmed);
      }

      return content;
    }

    return '';
  }

  /**
   * Decodifica una cadena base64 a cadena binaria.
   */
  private static decodeBase64ToString(base64: string): string {
    const cleanB64 = base64.replace(/\s/g, '');
    if (typeof atob !== 'undefined') {
      try {
        return atob(cleanB64);
      } catch {
        // Fallback
      }
    }
    // Fallback estándar para base64 si atob no está disponible
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    let i = 0;
    while (i < cleanB64.length) {
      const enc1 = chars.indexOf(cleanB64.charAt(i++));
      const enc2 = chars.indexOf(cleanB64.charAt(i++));
      const enc3 = chars.indexOf(cleanB64.charAt(i++));
      const enc4 = chars.indexOf(cleanB64.charAt(i++));

      const chr1 = (enc1 << 2) | (enc2 >> 4);
      const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
      const chr3 = ((enc3 & 3) << 6) | enc4;

      output += String.fromCharCode(chr1);
      if (enc3 !== 64 && enc3 !== -1) output += String.fromCharCode(chr2);
      if (enc4 !== 64 && enc4 !== -1) output += String.fromCharCode(chr3);
    }
    return output;
  }

  /**
   * Decodifica secuencias de escape de literales de cadena en PDF (ej. \(, \), \\, \ddd, \r, \n).
   */
  public static unescapePdfLiteralString(str: string): string {
    let result = '';
    let i = 0;
    const len = str.length;

    while (i < len) {
      const char = str[i];
      if (char === '\\' && i + 1 < len) {
        i++;
        const next = str[i];
        switch (next) {
          case 'n':
            result += '\n';
            break;
          case 'r':
            result += '\r';
            break;
          case 't':
            result += '\t';
            break;
          case 'b':
            result += '\b';
            break;
          case 'f':
            result += '\f';
            break;
          case '(':
            result += '(';
            break;
          case ')':
            result += ')';
            break;
          case '\\':
            result += '\\';
            break;
          default:
            // Códigos octales \ddd
            if (next >= '0' && next <= '7') {
              let octal = next;
              if (i + 1 < len && str[i + 1] >= '0' && str[i + 1] <= '7') {
                octal += str[++i];
                if (i + 1 < len && str[i + 1] >= '0' && str[i + 1] <= '7') {
                  octal += str[++i];
                }
              }
              const code = parseInt(octal, 8);
              result += String.fromCharCode(code);
            } else {
              result += next;
            }
            break;
        }
      } else {
        result += char;
      }
      i++;
    }

    return result;
  }

  /**
   * Decodifica una cadena hexadecimal de PDF <48656c6c6f> a texto ASCII/Latin1.
   */
  public static decodeHexPdfString(hex: string): string {
    let cleanHex = hex.replace(/[^0-9a-fA-F]/g, '');
    if (cleanHex.length % 2 !== 0) cleanHex += '0';
    let str = '';
    for (let i = 0; i < cleanHex.length; i += 2) {
      const code = parseInt(cleanHex.slice(i, i + 2), 16);
      str += String.fromCharCode(code);
    }
    return str;
  }

  /**
   * Extrae texto de un fragmento de stream de contenido PDF evaluando operadores de texto (BT...ET).
   */
  public static extractTextFromStreamBlock(streamText: string): string {
    const textPieces: string[] = [];

    // 1. Extraer todos los bloques BT ... ET
    const btRegex = /BT[\s\S]*?ET/g;
    let btMatch: RegExpExecArray | null;

    while ((btMatch = btRegex.exec(streamText)) !== null) {
      const block = btMatch[0];

      // A. Operador Tj con cadena literal: (texto) Tj
      const tjLiteralRegex = /\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|'|")/g;
      let tjMatch: RegExpExecArray | null;
      while ((tjMatch = tjLiteralRegex.exec(block)) !== null) {
        const decoded = this.unescapePdfLiteralString(tjMatch[1]);
        if (decoded.trim()) textPieces.push(decoded);
      }

      // B. Operador Tj con cadena hexadecimal: <hex> Tj
      const tjHexRegex = /<([0-9a-fA-F]+)>\s*(?:Tj|'|")/g;
      let hexMatch: RegExpExecArray | null;
      while ((hexMatch = tjHexRegex.exec(block)) !== null) {
        const decoded = this.decodeHexPdfString(hexMatch[1]);
        if (decoded.trim()) textPieces.push(decoded);
      }

      // C. Operador TJ con arreglo: [(cadena1) 120 (cadena2)] TJ
      const tjArrayRegex = /\[([\s\S]*?)\]\s*TJ/g;
      let tjArrMatch: RegExpExecArray | null;
      while ((tjArrMatch = tjArrayRegex.exec(block)) !== null) {
        const arrayBody = tjArrMatch[1];
        let subLine = '';

        // Buscar literales dentro del array
        const subLiteralRegex = /\(((?:[^()\\]|\\.)*)\)|<([0-9a-fA-F]+)>/g;
        let subMatch: RegExpExecArray | null;
        while ((subMatch = subLiteralRegex.exec(arrayBody)) !== null) {
          if (subMatch[1] !== undefined) {
            subLine += this.unescapePdfLiteralString(subMatch[1]);
          } else if (subMatch[2] !== undefined) {
            subLine += this.decodeHexPdfString(subMatch[2]);
          }
        }
        if (subLine.trim()) {
          textPieces.push(subLine);
        }
      }
    }

    // 2. Si no hubo bloques formales BT...ET (por ejemplo, streams crudos o simulados), buscar literales (texto) Tj
    if (textPieces.length === 0) {
      const fallbackRegex = /\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|'|"|T\*)/g;
      let fbMatch: RegExpExecArray | null;
      while ((fbMatch = fallbackRegex.exec(streamText)) !== null) {
        const decoded = this.unescapePdfLiteralString(fbMatch[1]);
        if (decoded.trim()) textPieces.push(decoded);
      }
    }

    // 3. Fallback adicional para streams de texto plano estructurados en texto crudo
    if (textPieces.length === 0) {
      const plainLines = streamText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('%') && !l.endsWith('obj') && l !== 'endobj' && l !== 'stream' && l !== 'endstream');
      
      const financialIndicators = /(?:FECHA|CONCEPTO|RETIRO|DEPOSITO|SALDO|CARGO|ABONO|BBVA|SANTANDER|BANORTE|MXN|\$\s*\d+)/i;
      const plausible = plainLines.filter((l) => financialIndicators.test(l));
      if (plausible.length > 0) {
        return plausible.join('\n');
      }
    }

    return textPieces.join('\n');
  }

  /**
   * Procesa de extremo a extremo el contenido del documento PDF y extrae su texto segmentado.
   */
  public static decode(content: Uint8Array | string): DecodedPdfStreamData {
    const rawBinary = this.normalizeContentToString(content);

    // 1. Detección de cifrado / contraseña
    const isEncrypted = /\/Encrypt\s+\d+\s+\d+\s+R/i.test(rawBinary) || /\/Encrypt\b/i.test(rawBinary);

    // 2. Extracción de metadatos del documento si existen
    const producerMatch = /\/Producer\s*\(([^)]+)\)/i.exec(rawBinary);
    const creationDateMatch = /\/CreationDate\s*\(([^)]+)\)/i.exec(rawBinary);

    // 3. Segmentación de streams de contenido
    const streamRegex = /\bstream\s*[\r\n]+([\s\S]*?)[\r\n]+\s*endstream/gi;
    const streamBlocks: string[] = [];
    let streamMatch: RegExpExecArray | null;

    while ((streamMatch = streamRegex.exec(rawBinary)) !== null) {
      streamBlocks.push(streamMatch[1]);
    }

    // 4. Procesar streams y segmentar por páginas
    const pages: ExtractedPdfPage[] = [];
    let fullTextAccumulator = '';

    // Si el PDF contiene marcadores de páginas explícitos (/Type /Page)
    const pageSections = rawBinary.split(/\/Type\s*\/Page\b/i);

    if (pageSections.length > 1) {
      for (let i = 1; i < pageSections.length; i++) {
        const section = pageSections[i];
        const pageText = this.extractTextFromStreamBlock(section);
        if (pageText.trim()) {
          const lines = pageText.split('\n').filter((l) => l.trim().length > 0);
          pages.push({
            pageNumber: pages.length + 1,
            text: pageText,
            lines,
          });
          fullTextAccumulator += (fullTextAccumulator ? '\n\n' : '') + pageText;
        }
      }
    }

    // Si no se obtuvieron páginas mediante /Type /Page, procesar por streamBlocks
    if (pages.length === 0) {
      if (streamBlocks.length > 1) {
        for (let p = 0; p < streamBlocks.length; p++) {
          const pageText = this.extractTextFromStreamBlock(streamBlocks[p]);
          if (pageText.trim()) {
            const lines = pageText.split('\n').filter((l) => l.trim().length > 0);
            pages.push({
              pageNumber: pages.length + 1,
              text: pageText,
              lines,
            });
            fullTextAccumulator += (fullTextAccumulator ? '\n\n' : '') + pageText;
          }
        }
      } else {
        const fallbackText = streamBlocks.length === 1
          ? this.extractTextFromStreamBlock(streamBlocks[0])
          : this.extractTextFromStreamBlock(rawBinary);

        if (fallbackText.trim()) {
          const lines = fallbackText.split('\n').filter((l) => l.trim().length > 0);
          pages.push({
            pageNumber: 1,
            text: fallbackText,
            lines,
          });
          fullTextAccumulator = fallbackText;
        }
      }
    }

    const hasSearchableText = fullTextAccumulator.trim().length > 0;

    return {
      rawText: fullTextAccumulator,
      pages: pages.length > 0 ? pages : [],
      isEncrypted,
      hasSearchableText,
      metadata: {
        producer: producerMatch ? producerMatch[1] : undefined,
        creationDate: creationDateMatch ? creationDateMatch[1] : undefined,
      },
    };
  }
}
