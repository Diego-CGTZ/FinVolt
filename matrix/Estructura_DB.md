Estructura DB
=============

### 1\. Tablas Core (Perfil y Cuentas)

**Tabla: profiles (Usuarios)**Maneja la información básica del usuario (Supabase maneja la autenticación por separado en una tabla oculta auth.users).

- id (UUID, PK) -> Relacionado con auth.users

- name (String)

- created\_at (Timestamp)

**Tabla: accounts (Cuentas y Tarjetas)**El inventario de dónde está el dinero o de dónde proviene la deuda.

- id (UUID, PK)

- user\_id (UUID, FK -> [profiles.id](http://profiles.id))

- name (String) -> ej. "BBVA Débito", "Nu Crédito"

- type (Enum) -> DEBIT, CASH, CREDIT

- current\_balance (Integer, en centavos) -> Saldo positivo para débito/efectivo, negativo para deudas de tarjetas.

- credit\_limit (Integer, nullable) -> Límite de la TC.

- cut\_off\_day (Integer, 1-31, nullable) -> Día de corte de la TC.

- payment\_due\_day (Integer, 1-31, nullable) -> Día límite de pago de la TC.

**Tabla: recurring\_incomes (Nómina / Módulo 1)**

- id (UUID, PK)

- user\_id (UUID, FK -> [profiles.id](http://profiles.id))

- account\_id (UUID, FK -> [accounts.id](http://accounts.id)) -> A dónde llega el dinero.

- amount (Integer, en centavos)

- frequency (Enum) -> WEEKLY, BIWEEKLY, MONTHLY

- next\_payment\_date (Date)

### 2\. Tablas de Presupuesto (Sobres Digitales)

**Tabla: categories (Categorías / Módulo 4)**

- id (UUID, PK)

- user\_id (UUID, FK -> [profiles.id](http://profiles.id))

- name (String) -> ej. "Comida", "Renta"

- icon\_name (String) -> Nombre del ícono para el frontend.

- budget\_percentage (Decimal/Numeric) -> ej. 30.00 (Aquí sí usamos decimal porque es un porcentaje que no excede 100.00).

### 3\. Tablas de Gastos Compartidos (Cuentas por Cobrar)

**Tabla: debtors (Contactos / Módulo 6)**

- id (UUID, PK)

- user\_id (UUID, FK -> [profiles.id](http://profiles.id))

- name (String) -> ej. "Roomie", "Juan"

- _(Nota: No guardamos el "total adeudado" como una columna estática para evitar desincronizaciones. El total se calcula sumando y restando dinámicamente sus movimientos en la tabla transacciones)._

### 4\. Tabla Maestra (El Gran Ledger)

**Tabla: transactions (Movimientos / Módulo 3 y 6)**Esta tabla es el corazón de la aplicación. Maneja cualquier flujo de dinero, incluyendo los préstamos y las deudas divididas.

- id (UUID, PK)

- user\_id (UUID, FK -> [profiles.id](http://profiles.id))

- account\_id (UUID, FK -> [accounts.id](http://accounts.id)) -> La cuenta afectada.

- type (Enum) -> Define qué hizo el dinero:

  - EXPENSE (Gasto normal)

  - INCOME (Ingreso extra)

  - TRANSFER (Movimiento entre tus cuentas)

  - LOAN\_GIVEN (Prestaste dinero o pagaste por alguien)

  - LOAN\_PAYMENT\_RECEIVED (Te pagaron una deuda parcial o total)

- amount (Integer, en centavos) -> Siempre en positivo. El type le da la dirección matemática.

- date (Timestamp)

- description (String, nullable)

- category\_id (UUID, FK -> [categories.id](http://categories.id), nullable) -> Obligatorio solo para EXPENSE.

- debtor\_id (UUID, FK -> [debtors.id](http://debtors.id), nullable) -> Obligatorio solo para préstamos y pagos recibidos.

- group\_id (UUID, nullable) -> **El secreto para dividir cuentas (Split):** Permite agrupar varias transacciones que ocurrieron en un solo ticket.
