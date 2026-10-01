/**
 * US-021: Provider Detector
 *
 * Detecta la institución financiera o proveedor de origen a partir del
 * nombre de paquete, título o contenido de la notificación/evento crudo.
 */

export type KnownProvider =
  | 'BBVA'
  | 'NU'
  | 'SANTANDER'
  | 'BANORTE'
  | 'CITIBANAMEX'
  | 'MERCADO_PAGO'
  | 'HSBC'
  | 'SCOTIABANK'
  | 'GENERIC';

export interface DetectedProvider {
  provider: KnownProvider;
  displayName: string;
  confidence: number;
  matchedOn: 'PACKAGE_NAME' | 'TITLE' | 'TEXT' | 'FALLBACK';
}

interface ProviderRule {
  provider: KnownProvider;
  displayName: string;
  packageNames: string[];
  keywords: string[];
}

export const PROVIDER_RULES: ProviderRule[] = [
  {
    provider: 'BBVA',
    displayName: 'BBVA México',
    packageNames: ['com.bbva.bancomer', 'com.bbva.bbvacompass', 'com.bbva.netcash'],
    keywords: ['bbva', 'bancomer', 'línea bbva', 'linea bbva'],
  },
  {
    provider: 'NU',
    displayName: 'Nu México',
    packageNames: ['mx.nu.app', 'com.nu.production', 'br.com.nubank'],
    keywords: ['nu', 'nubank', 'cuenta nu', 'tarjeta nu'],
  },
  {
    provider: 'SANTANDER',
    displayName: 'Santander México',
    packageNames: ['mx.santander.mobile', 'com.santander.app', 'com.isb.santander'],
    keywords: ['santander', 'supermóvil', 'supermovil', 'supernet'],
  },
  {
    provider: 'BANORTE',
    displayName: 'Banorte',
    packageNames: ['com.banorte.movil', 'com.banorte.banortemovil'],
    keywords: ['banorte', 'banorte móvil', 'banorte movil'],
  },
  {
    provider: 'CITIBANAMEX',
    displayName: 'Citibanamex',
    packageNames: ['com.banamex.citibanamexmovil', 'com.citibanamex.movil'],
    keywords: ['citibanamex', 'banamex', 'bancanet'],
  },
  {
    provider: 'MERCADO_PAGO',
    displayName: 'Mercado Pago',
    packageNames: ['com.mercadopago.wallet'],
    keywords: ['mercado pago', 'mercadopago'],
  },
  {
    provider: 'HSBC',
    displayName: 'HSBC México',
    packageNames: ['mx.hsbc.hsbcmexico', 'com.hsbc.hsbcnet'],
    keywords: ['hsbc', 'hsbc móvil', 'hsbc movil'],
  },
  {
    provider: 'SCOTIABANK',
    displayName: 'Scotiabank México',
    packageNames: ['com.scotiabank.scotiamovil'],
    keywords: ['scotiabank', 'scotiamóvil', 'scotiamovil'],
  },
];

export class ProviderDetector {
  /**
   * Detecta el proveedor financiero evaluando primero el nombre de paquete Android
   * y secundariamente el título y cuerpo del mensaje.
   */
  public static detect(input: {
    packageName?: string;
    title?: string;
    text?: string;
  }): DetectedProvider {
    const pkg = (input.packageName || '').toLowerCase().trim();
    const title = (input.title || '').toLowerCase();
    const text = (input.text || '').toLowerCase();
    const combinedContent = `${title} ${text}`;

    // 1. Coincidencia exacta o parcial de Package Name (Máxima confianza)
    if (pkg) {
      for (const rule of PROVIDER_RULES) {
        if (rule.packageNames.some((p) => pkg.includes(p.toLowerCase()))) {
          return {
            provider: rule.provider,
            displayName: rule.displayName,
            confidence: 98,
            matchedOn: 'PACKAGE_NAME',
          };
        }
      }
    }

    // 2. Coincidencia en Título
    if (title) {
      for (const rule of PROVIDER_RULES) {
        for (const kw of rule.keywords) {
          const regex = new RegExp(`\\b${kw}\\b`, 'i');
          if (regex.test(title)) {
            return {
              provider: rule.provider,
              displayName: rule.displayName,
              confidence: 88,
              matchedOn: 'TITLE',
            };
          }
        }
      }
    }

    // 3. Coincidencia en Cuerpo de Texto
    if (text) {
      for (const rule of PROVIDER_RULES) {
        for (const kw of rule.keywords) {
          const regex = new RegExp(`\\b${kw}\\b`, 'i');
          if (regex.test(combinedContent)) {
            return {
              provider: rule.provider,
              displayName: rule.displayName,
              confidence: 75,
              matchedOn: 'TEXT',
            };
          }
        }
      }
    }

    // 4. Fallback: Proveedor Financiero Genérico
    return {
      provider: 'GENERIC',
      displayName: 'Entidad Financiera',
      confidence: 50,
      matchedOn: 'FALLBACK',
    };
  }
}
