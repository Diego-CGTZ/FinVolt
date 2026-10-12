/**
 * US-031: Catálogo Base de Mapeos de Comercio y Reglas Determinísticas
 *
 * Mapeo determinístico de comercios populares y patrones sintácticos a categorías canónicas
 * alineadas con el seed del sistema (US-007 / 0002_categories_model.sql).
 *
 * Sin dependencias de ML ni LLM.
 */

export interface CategoryRuleDefinition {
  id: string;
  categoryName: string;
  patterns: (string | RegExp)[];
  priority: number;
  description?: string;
  isUserCorrection?: boolean;
  userId?: string | null;
}

/**
 * Mapeo directo y determinístico de comercios canónicos (Merchant Mapping - Etapa 1).
 * Claves en minúsculas y sin acentos para coincidencia rápida y exacta.
 */
export const DEFAULT_MERCHANT_TO_CATEGORY: Record<string, string> = {
  // ── Supermercados y Tiendas de Conveniencia ────────────────────────────────
  'walmart': 'Supermercado',
  'walmart express': 'Supermercado',
  'walmart supercenter': 'Supermercado',
  'superama': 'Supermercado',
  'bodega aurrera': 'Supermercado',
  'soriana': 'Supermercado',
  'soriana hiper': 'Supermercado',
  'soriana super': 'Supermercado',
  'chedraui': 'Supermercado',
  'chedraui selecto': 'Supermercado',
  'costco': 'Supermercado',
  'costco wholesale': 'Supermercado',
  'sam\'s club': 'Supermercado',
  'sams club': 'Supermercado',
  'h-e-b': 'Supermercado',
  'heb': 'Supermercado',
  'la comer': 'Supermercado',
  'city market': 'Supermercado',
  'fresko': 'Supermercado',
  'oxxo': 'Supermercado',
  '7-eleven': 'Supermercado',
  'seven eleven': 'Supermercado',
  'circle k': 'Supermercado',
  'extra': 'Supermercado',

  // ── Restaurantes, Comida Rápida y Delivery ─────────────────────────────────
  'uber eats': 'Restaurantes',
  'rappi': 'Restaurantes',
  'didi food': 'Restaurantes',
  'mcdonald\'s': 'Restaurantes',
  'mcdonalds': 'Restaurantes',
  'burger king': 'Restaurantes',
  'subway': 'Restaurantes',
  'kfc': 'Restaurantes',
  'kentucky fried chicken': 'Restaurantes',
  'domino\'s pizza': 'Restaurantes',
  'dominos pizza': 'Restaurantes',
  'little caesars': 'Restaurantes',
  'pizza hut': 'Restaurantes',
  'vips': 'Restaurantes',
  'toks': 'Restaurantes',
  'sanborns': 'Restaurantes',
  'el porton': 'Restaurantes',
  'chili\'s': 'Restaurantes',
  'chilis': 'Restaurantes',
  'applebee\'s': 'Restaurantes',
  'ihop': 'Restaurantes',
  'casa de tono': 'Restaurantes',
  'la casa de tono': 'Restaurantes',
  'carl\'s jr': 'Restaurantes',
  'carls jr': 'Restaurantes',
  'wingstop': 'Restaurantes',
  'buffalo wild wings': 'Restaurantes',
  'alitas': 'Restaurantes',
  'tacos el pata': 'Restaurantes',
  'el fogoncito': 'Restaurantes',

  // ── Cafeterías ─────────────────────────────────────────────────────────────
  'starbucks': 'Cafeterías',
  'cielito querido cafe': 'Cafeterías',
  'punta del cielo': 'Cafeterías',
  'tim hortons': 'Cafeterías',
  'the italian coffee company': 'Cafeterías',
  'cafe punta del cielo': 'Cafeterías',

  // ── Transporte y Movilidad ─────────────────────────────────────────────────
  'uber': 'Transporte',
  'uber trip': 'Transporte',
  'didi': 'Transporte',
  'didi mobility': 'Transporte',
  'cabify': 'Transporte',
  'indrive': 'Transporte',
  'metro cdmx': 'Transporte',
  'metrobus': 'Transporte',
  'tag pase': 'Transporte',
  'pase': 'Transporte',
  'televia': 'Transporte',
  'autovia': 'Transporte',

  // ── Gasolina y Combustible ─────────────────────────────────────────────────
  'pemex': 'Gasolina',
  'shell': 'Gasolina',
  'bp': 'Gasolina',
  'oxxo gas': 'Gasolina',
  'g500': 'Gasolina',
  'mobil': 'Gasolina',
  'total energies': 'Gasolina',
  'chevron': 'Gasolina',
  'repsol': 'Gasolina',
  'hidrosina': 'Gasolina',
  'petro seven': 'Gasolina',

  // ── Servicios Básicos y Conectividad ───────────────────────────────────────
  'cfe': 'Servicios',
  'comision federal de electricidad': 'Servicios',
  'telmex': 'Servicios',
  'telcel': 'Servicios',
  'at&t': 'Servicios',
  'att': 'Servicios',
  'movistar': 'Servicios',
  'izzi': 'Servicios',
  'totalplay': 'Servicios',
  'megacable': 'Servicios',
  'naturgy': 'Servicios',
  'sacmex': 'Servicios',
  'siapa': 'Servicios',
  'agua de puebla': 'Servicios',

  // ── Suscripciones y Streaming ──────────────────────────────────────────────
  'netflix': 'Suscripciones',
  'spotify': 'Suscripciones',
  'disney+': 'Suscripciones',
  'disney plus': 'Suscripciones',
  'hbo max': 'Suscripciones',
  'max': 'Suscripciones',
  'amazon prime': 'Suscripciones',
  'prime video': 'Suscripciones',
  'apple music': 'Suscripciones',
  'apple services': 'Suscripciones',
  'apple.com/bill': 'Suscripciones',
  'youtube premium': 'Suscripciones',
  'google storage': 'Suscripciones',
  'icloud': 'Suscripciones',
  'chatgpt': 'Suscripciones',
  'openai': 'Suscripciones',

  // ── Entretenimiento y Ocio ─────────────────────────────────────────────────
  'cinepolis': 'Entretenimiento',
  'cinemex': 'Entretenimiento',
  'ticketmaster': 'Entretenimiento',
  'superboletos': 'Entretenimiento',
  'playstation': 'Entretenimiento',
  'playstation network': 'Entretenimiento',
  'xbox': 'Entretenimiento',
  'nintendo': 'Entretenimiento',
  'steam': 'Entretenimiento',

  // ── Farmacias y Salud ──────────────────────────────────────────────────────
  'farmacias del ahorro': 'Farmacia',
  'farmacias guadalajara': 'Farmacia',
  'farmacias san pablo': 'Farmacia',
  'farmacias benavides': 'Farmacia',
  'farmacias similares': 'Farmacia',
  'salud digna': 'Salud',
  'laboratorios chopo': 'Salud',
  'laboratorio chopo': 'Salud',
  'hospitales angeles': 'Salud',
  'medica sur': 'Salud',

  // ── Ropa, Calzado y Tiendas Departamentales ────────────────────────────────
  'zara': 'Ropa',
  'h&m': 'Ropa',
  'hm': 'Ropa',
  'pull & bear': 'Ropa',
  'pull&bear': 'Ropa',
  'bershka': 'Ropa',
  'stradivarius': 'Ropa',
  'massimo dutti': 'Ropa',
  'shein': 'Ropa',
  'innovasport': 'Ropa',
  'marti': 'Ropa',
  'nike': 'Ropa',
  'adidas': 'Ropa',
  'liverpool': 'Ropa',
  'el palacio de hierro': 'Ropa',
  'palacio de hierro': 'Ropa',
  'sears': 'Ropa',
  'suburbia': 'Ropa',

  // ── Tecnología y Electrónica ───────────────────────────────────────────────
  'apple store': 'Tecnología',
  'best buy': 'Tecnología',
  'radio shack': 'Tecnología',
  'steren': 'Tecnología',
  'amazon web services': 'Tecnología',
  'cyberpuerta': 'Tecnología',
  'pcel': 'Tecnología',

  // ── Viajes y Hospedaje ─────────────────────────────────────────────────────
  'aeromexico': 'Viajes',
  'volaris': 'Viajes',
  'viva aerobus': 'Viajes',
  'vivaaerobus': 'Viajes',
  'airbnb': 'Viajes',
  'booking.com': 'Viajes',
  'booking': 'Viajes',
  'expedia': 'Viajes',
  'despegar': 'Viajes',
  'ado': 'Viajes',
  'autobuses ado': 'Viajes',

  // ── Mascotas ───────────────────────────────────────────────────────────────
  'petco': 'Mascota',
  'maskota': 'Mascota',

  // ── Vivienda y Muebles ─────────────────────────────────────────────────────
  'the home depot': 'Vivienda',
  'home depot': 'Vivienda',
  'ikea': 'Vivienda',
  'sodimac': 'Vivienda',
};

/**
 * Reglas determinísticas basadas en patrones sintácticos, palabras clave y atributos (Etapa 2).
 */
export const DEFAULT_SYNTACTIC_RULES: CategoryRuleDefinition[] = [
  // ── Reglas de Transporte ───────────────────────────────────────────────────
  {
    id: 'rule-syn-transport',
    categoryName: 'Transporte',
    patterns: [
      /\b(uber|didi|taxi|cabify|indrive|peaje|caseta|estacionamiento|park|parquimetro|valet)\b/i,
      /\b(metro|metrobus|tren ligero|suburbano|trolebus|rtp|transporte)\b/i,
    ],
    priority: 80,
    description: 'Movilidad urbana, taxis, peajes y transporte público',
  },

  // ── Reglas de Gasolina ─────────────────────────────────────────────────────
  {
    id: 'rule-syn-gasolina',
    categoryName: 'Gasolina',
    patterns: [
      /\b(gasolina|combustible|pemex|gasolinera|estacion de servicio|diesel|est serv)\b/i,
      /\b(hidrosina|petro seven|oxxo gas|total gas|g500)\b/i,
    ],
    priority: 85,
    description: 'Estaciones de carga y combustible',
  },

  // ── Reglas de Restaurantes y Alimentos ─────────────────────────────────────
  {
    id: 'rule-syn-restaurantes',
    categoryName: 'Restaurantes',
    patterns: [
      /\b(restaurante|taqueria|tacos|pizzeria|pizza|burger|hamburguesas|sushi|mariscos|asador|bistrot|grill)\b/i,
      /\b(cocina|fondita|comedor|loncheria|antojitos|alitas|wings|chilaquiles)\b/i,
    ],
    priority: 75,
    description: 'Restaurantes, taquerías y comida preparada',
  },

  // ── Reglas de Cafeterías ───────────────────────────────────────────────────
  {
    id: 'rule-syn-cafeterias',
    categoryName: 'Cafeterías',
    patterns: [
      /\b(cafeteria|coffee|cafe\b|espresso|cappuccino|starbucks|churros|panaderia|pasteleria|donuts|dunkin)\b/i,
    ],
    priority: 78,
    description: 'Cafeterías, panaderías y repostería',
  },

  // ── Reglas de Supermercados ────────────────────────────────────────────────
  {
    id: 'rule-syn-supermercado',
    categoryName: 'Supermercado',
    patterns: [
      /\b(supermercado|abarrotes|carniceria|verduleria|fruteria|cremeria|tiendita|mini super|minisuper)\b/i,
      /\b(walmart|aurrera|soriana|chedraui|costco|sams|la comer|oxxo|7-eleven)\b/i,
    ],
    priority: 70,
    description: 'Supermercados, abarrotes y despensa',
  },

  // ── Reglas de Farmacia y Salud ─────────────────────────────────────────────
  {
    id: 'rule-syn-farmacia',
    categoryName: 'Farmacia',
    patterns: [
      /\b(farmacia|botica|drogueria)\b/i,
    ],
    priority: 85,
    description: 'Medicamentos y farmacias',
  },
  {
    id: 'rule-syn-salud',
    categoryName: 'Salud',
    patterns: [
      /\b(hospital|clinica|medico|doctor|dental|dentista|optica|laboratorio|analisis clinicos|radiologia)\b/i,
      /\b(pediatra|ginecologo|traumatologo|psicologo|terapia)\b/i,
    ],
    priority: 82,
    description: 'Servicios médicos, laboratorios y hospitales',
  },

  // ── Reglas de Servicios ────────────────────────────────────────────────────
  {
    id: 'rule-syn-servicios',
    categoryName: 'Servicios',
    patterns: [
      /\b(cfe|luz|electricidad|comision federal)\b/i,
      /\b(agua potable|sistema de agua|sacmex|siapa)\b/i,
      /\b(gas natural|naturgy|gas lp)\b/i,
      /\b(telefonia|internet|cable|telmex|telcel|at&t|movistar|izzi|totalplay|megacable)\b/i,
    ],
    priority: 90,
    description: 'Servicios públicos, energía y telecomunicaciones',
  },

  // ── Reglas de Suscripciones y Software ─────────────────────────────────────
  {
    id: 'rule-syn-suscripciones',
    categoryName: 'Suscripciones',
    patterns: [
      /\b(netflix|spotify|disney|hbo|prime video|apple music|youtube premium|deezer|paramount)\b/i,
      /\b(suscripcion|subscription|membresia|membership|chatgpt|openai|patreon)\b/i,
    ],
    priority: 88,
    description: 'Servicios digitales recurrentes y streaming',
  },

  // ── Reglas de Entretenimiento ──────────────────────────────────────────────
  {
    id: 'rule-syn-entretenimiento',
    categoryName: 'Entretenimiento',
    patterns: [
      /\b(cine|cinepolis|cinemex|teatro|concierto|ticketmaster|superboletos|museo|parque de diversiones)\b/i,
      /\b(videojuegos|playstation|xbox|nintendo|steam|gaming|billar|bolos|bowling)\b/i,
    ],
    priority: 75,
    description: 'Cine, conciertos, juegos y eventos culturales',
  },

  // ── Reglas de Ropa y Calzado ───────────────────────────────────────────────
  {
    id: 'rule-syn-ropa',
    categoryName: 'Ropa',
    patterns: [
      /\b(boutique|zapateria|calzado|vestimenta|moda|tienda de ropa|trajes|vestidos)\b/i,
      /\b(zara|pull&bear|bershka|stradivarius|h&m|shein|liverpool|sears|suburbia)\b/i,
    ],
    priority: 70,
    description: 'Indumentaria, tiendas departamentales y calzado',
  },

  // ── Reglas de Educación ────────────────────────────────────────────────────
  {
    id: 'rule-syn-educacion',
    categoryName: 'Educación',
    patterns: [
      /\b(colegio|escuela|universidad|instituto|colegiatura|inscripcion escolar|kinder|guarderia)\b/i,
      /\b(libreria|libros|cuadernos|papeleria|curso|diplomado|talleres educativos)\b/i,
    ],
    priority: 80,
    description: 'Colegiaturas, libros y formación académica',
  },

  // ── Reglas de Viajes y Hospedaje ───────────────────────────────────────────
  {
    id: 'rule-syn-viajes',
    categoryName: 'Viajes',
    patterns: [
      /\b(aerolinea|aeromexico|volaris|vivaaerobus|vuelo|boletos de avion|terminal aerea)\b/i,
      /\b(hotel|hostal|hospedaje|airbnb|booking|resort|autobuses ado|linea de autobuses)\b/i,
    ],
    priority: 82,
    description: 'Vuelos, hoteles y líneas de autobuses foráneos',
  },

  // ── Reglas de Mascotas ─────────────────────────────────────────────────────
  {
    id: 'rule-syn-mascotas',
    categoryName: 'Mascota',
    patterns: [
      /\b(veterinaria|veterinario|pet shop|alimento para perro|croquetas|petco|maskota)\b/i,
    ],
    priority: 85,
    description: 'Atención veterinaria y productos para mascotas',
  },

  // ── Reglas de Vivienda y Mantenimiento ─────────────────────────────────────
  {
    id: 'rule-syn-vivienda',
    categoryName: 'Vivienda',
    patterns: [
      /\b(renta|alquiler departamento|mantenimiento edificio|cuota de mantenimiento|condominio)\b/i,
      /\b(ferreteria|plomeria|cerrajeria|pinturas|the home depot|home depot|sodimac|ikea)\b/i,
    ],
    priority: 75,
    description: 'Renta, mantenimiento habitacional y ferretería',
  },

  // ── Reglas de Ingresos y Nómina (type: INCOME) ─────────────────────────────
  {
    id: 'rule-syn-salario',
    categoryName: 'Salario',
    patterns: [
      /\b(nomina|sueldo|salario|pago de quincena|payroll|dispersion de nomina)\b/i,
    ],
    priority: 95,
    description: 'Depósitos de sueldo y nómina laboral',
  },

  // ── Reglas de Transferencias (type: TRANSFER) ──────────────────────────────
  {
    id: 'rule-syn-transferencia',
    categoryName: 'Transferencia',
    patterns: [
      /\b(spei|traspaso entre cuentas|transferencia interbancaria|retiro cajero|retiro en atm)\b/i,
    ],
    priority: 90,
    description: 'Traspasos propios y transferencias interbancarias',
  },
];
