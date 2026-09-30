/**
 * Catálogo y filtro de aplicaciones financieras reconocidas (US-020).
 *
 * Filtra de manera estricta las notificaciones entrantes de Android para
 * procesar ÚNICAMENTE notificaciones de instituciones bancarias o fintech,
 * garantizando la privacidad del usuario (WhatsApp, mensajería y redes sociales
 * son descartadas de inmediato).
 */

export interface FinancialAppMeta {
  packageName: string;
  name: string;
  bankCode?: string;
}

export const KNOWN_FINANCIAL_APPS: Record<string, FinancialAppMeta> = {
  // BBVA México
  'com.bbva.bbvacontigo': { packageName: 'com.bbva.bbvacontigo', name: 'BBVA México', bankCode: 'BBVA' },
  'com.bbva.empresas': { packageName: 'com.bbva.empresas', name: 'BBVA Empresas', bankCode: 'BBVA' },

  // Nu México
  'com.nu.production': { packageName: 'com.nu.production', name: 'Nu México', bankCode: 'NU' },
  'com.nu.mexico': { packageName: 'com.nu.mexico', name: 'Nu México', bankCode: 'NU' },

  // Santander México
  'mx.com.santander.supermovil': { packageName: 'mx.com.santander.supermovil', name: 'Santander SuperMóvil', bankCode: 'SANTANDER' },
  'mx.com.santander.plus': { packageName: 'mx.com.santander.plus', name: 'Santander Plus', bankCode: 'SANTANDER' },

  // Citibanamex
  'com.banamex.movil': { packageName: 'com.banamex.movil', name: 'Citibanamex Móvil', bankCode: 'CITIBANAMEX' },

  // Banorte
  'com.banorte.movil': { packageName: 'com.banorte.movil', name: 'Banorte Móvil', bankCode: 'BANORTE' },

  // HSBC México
  'com.hsbc.hsbcmexico': { packageName: 'com.hsbc.hsbcmexico', name: 'HSBC México', bankCode: 'HSBC' },

  // Mercado Pago
  'com.mercadopago.wallet': { packageName: 'com.mercadopago.wallet', name: 'Mercado Pago', bankCode: 'MERCADO_PAGO' },

  // Hey Banco
  'com.heybanco.app': { packageName: 'com.heybanco.app', name: 'Hey Banco', bankCode: 'HEY_BANCO' },

  // Scotiabank
  'com.scotiabank.mx': { packageName: 'com.scotiabank.mx', name: 'Scotiabank México', bankCode: 'SCOTIABANK' },

  // Spin by OXXO
  'com.spinbyoxxo.app': { packageName: 'com.spinbyoxxo.app', name: 'Spin by OXXO', bankCode: 'SPIN' },

  // Klar
  'mx.klar.app': { packageName: 'mx.klar.app', name: 'Klar', bankCode: 'KLAR' },

  // Albo
  'com.albo.alboapp': { packageName: 'com.albo.alboapp', name: 'Albo', bankCode: 'ALBO' },

  // Didi Pay
  'com.didiglobal.passenger': { packageName: 'com.didiglobal.passenger', name: 'DiDi Pay', bankCode: 'DIDI' },

  // RappiPay
  'com.grability.rappi': { packageName: 'com.grability.rappi', name: 'RappiPay', bankCode: 'RAPPI' },
};

// Palabras clave de transacciones financieras
const FINANCIAL_CONTENT_KEYWORDS = [
  'compra',
  'retiro',
  'transferencia',
  'cargo',
  'deposito',
  'depósito',
  'abono',
  'pago',
  'disposición',
  'spei',
  'enviaste',
  'recibiste',
  'autorizada',
  'declinada',
  'comprobante',
  'saldo',
];

export class FinancialAppWhitelist {
  /**
   * Determina si un paquete pertenece a una institución financiera conocida.
   */
  static isKnownApp(packageName: string): boolean {
    if (!packageName) return false;
    return Boolean(KNOWN_FINANCIAL_APPS[packageName.toLowerCase()]);
  }

  /**
   * Obtiene los metadatos de la app financiera conocida.
   */
  static getAppMeta(packageName: string): FinancialAppMeta | undefined {
    return KNOWN_FINANCIAL_APPS[packageName.toLowerCase()];
  }

  /**
   * Analiza si una notificación es de naturaleza financiera combinando
   * el paquete de origen con un análisis de palabras clave en el texto.
   */
  static isFinancialNotification(packageName: string, textContent = ''): boolean {
    if (!packageName) return false;

    // Si es una app financiera conocida en la lista blanca
    if (this.isKnownApp(packageName)) {
      return true;
    }

    // Si el nombre del paquete contiene indicios explícitos de finanzas o banco
    const pkgLower = packageName.toLowerCase();
    const isBankingPkg =
      pkgLower.includes('bank') ||
      pkgLower.includes('banco') ||
      pkgLower.includes('finance') ||
      pkgLower.includes('wallet') ||
      pkgLower.includes('fintech') ||
      pkgLower.includes('caja');

    if (isBankingPkg) {
      return true;
    }

    // Análisis de contenido con detección de monto monetario ($...)
    const textLower = textContent.toLowerCase();
    const hasMoneySign = textLower.includes('$') || textLower.includes('mxn');
    const hasFinancialKeyword = FINANCIAL_CONTENT_KEYWORDS.some((kw) => textLower.includes(kw));

    return hasMoneySign && hasFinancialKeyword;
  }
}
