# Personal Finance App — Project Blueprint

## 1. Visión del producto

Construir una aplicación personal de finanzas que registre y normalice movimientos financieros de forma **lo más automática posible**, utilizando múltiples fuentes de información.

El usuario no debería tener que registrar manualmente cada gasto. La aplicación debe:

1. Detectar movimientos automáticamente.
2. Extraer información de distintas fuentes.
3. Normalizar la información.
4. Detectar duplicados.
5. Reconciliar información proveniente de diferentes fuentes.
6. Clasificar transacciones.
7. Aprender de las correcciones del usuario.
8. Pedir confirmación únicamente cuando exista incertidumbre.

### Objetivo principal

> Convertir múltiples fuentes de información financiera en un único historial financiero confiable y normalizado.

La métrica principal de automatización será:

**% de transacciones registradas automáticamente / total de transacciones**

---

# 2. Principio arquitectónico fundamental

La aplicación NO debe diseñarse como un simple expense tracker.

No pensar:

```text
Usuario → registra gasto → Base de datos
```

Sino:

```text
Fuentes
   ↓
Ingestion
   ↓
Raw Events
   ↓
Parsing
   ↓
Normalization
   ↓
Reconciliation
   ↓
Transactions
   ↓
Classification
   ↓
Budgets / Liquidity / Dashboard
```

El usuario solamente interviene cuando el sistema no tiene suficiente confianza.

---

# 3. Fuentes de información

La arquitectura debe ser extensible mediante adapters.

## Fuentes iniciales

### Android

- Notificaciones bancarias
- Notificaciones de tarjetas
- SMS cuando sea técnicamente viable

### Email

- Gmail
- Outlook

### Archivos

- PDF
- CSV
- XLSX

### Manual

- Gastos
- Ingresos
- Transferencias
- Efectivo
- Préstamos
- Abonos

### Fuentes futuras

- Google Wallet
- Apple Wallet
- APIs bancarias
- Open Banking
- OCR de tickets
- Otras fuentes financieras

IMPORTANTE:

Las integraciones con Wallet no deben ser una dependencia fundamental de la aplicación. La arquitectura debe funcionar aunque Wallet no pueda proporcionar información.

---

# 4. Plataformas

## Mobile

React Native + Expo.

Expo debe utilizarse como base multiplataforma, pero se permite utilizar módulos nativos cuando sea necesario.

### Android

Puede utilizarse:

```text
NotificationListenerService
```

para detectar notificaciones financieras, siempre mediante autorización explícita del usuario.

Arquitectura:

```text
React Native / Expo
        ↓
Native Android Module
        ↓
NotificationListenerService
        ↓
Financial Ingestion Engine
```

### iOS

No asumir acceso general a las notificaciones de otras aplicaciones.

La estrategia principal será:

```text
Email
PDF
CSV
XLSX
Manual
Bank APIs futuras
```

---

# 5. Stack inicial

## Frontend

- React Native
- Expo
- TypeScript

## Backend

- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Storage
- Supabase Edge Functions

## Serverless

Node.js / TypeScript.

Evitar servidores permanentes cuando no sean necesarios.

## Objetivo de infraestructura

Mantener el proyecto en costo $0 durante el desarrollo personal siempre que sea técnicamente posible.

---

# 6. Arquitectura general

```text
                    ┌─────────────────────┐
                    │       SOURCES       │
                    └──────────┬──────────┘
                               │
       ┌───────────────────────┼───────────────────────┐
       │                       │                       │
       ▼                       ▼                       ▼
 Notifications              Email                  Files
 Android                  Gmail/Outlook          PDF/CSV/XLSX
       │                       │                       │
       └───────────────────────┼───────────────────────┘
                               ▼
                    ┌─────────────────────┐
                    │ INGESTION ENGINE    │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │   RAW EVENTS        │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │     PARSING         │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │   NORMALIZATION     │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │   RECONCILIATION    │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │   TRANSACTIONS      │
                    └──────────┬──────────┘
                               │
             ┌─────────────────┼──────────────────┐
             ▼                 ▼                  ▼
         Liquidity          Budgets           Dashboard
             │                 │                  │
             └─────────────────┼──────────────────┘
                               ▼
                           Alerts
```

---

# 7. Raw Events

Nunca insertar directamente información externa en `transactions`.

Toda información externa debe entrar primero como:

```text
raw_event
```

Ejemplo:

```json
{
  "source_type": "android_notification",
  "provider": "BBVA",
  "received_at": "...",
  "title": "BBVA",
  "body": "Compra por $450.00 en OXXO",
  "raw_payload": {}
}
```

Esto permite:

- Reprocesar información.
- Mejorar parsers.
- Auditar errores.
- Detectar cambios en formatos.
- Evitar pérdida de información.

---

# 8. Adapter Architecture

No crear un parser monolítico.

Utilizar adapters independientes:

```text
FinancialSourceAdapter
        │
        ├── BBVANotificationParser
        ├── SantanderNotificationParser
        ├── NuNotificationParser
        ├── PlataNotificationParser
        ├── RevolutNotificationParser
        ├── GmailAdapter
        ├── OutlookAdapter
        ├── PDFStatementParser
        ├── CSVParser
        └── XLSXParser
```

Cada adapter convierte información específica del proveedor a un modelo financiero común.

---

# 9. Canonical Transaction Model

Todas las fuentes deben terminar en un modelo financiero universal.

Conceptualmente:

```typescript
Transaction {
    id

    account_id

    type
    amount
    currency

    occurred_at
    posted_at

    merchant
    description

    category_id

    source_id
    source_event_id

    status

    confidence_score

    fingerprint

    created_at
    updated_at
}
```

## Transaction Types

Como mínimo:

```text
EXPENSE
INCOME
TRANSFER
CARD_PAYMENT
REFUND
CASH_WITHDRAWAL
LOAN
LOAN_PAYMENT
ADJUSTMENT
```

No tratar todo como `expense` o `income`.

---

# 10. Accounts

Toda fuente financiera debe estar asociada a una cuenta.

Ejemplo:

```text
Accounts

BBVA Débito       $14,500
BBVA Crédito      -$3,200
Nu Crédito        -$1,800
Revolut             $4,200
Efectivo            $1,200
```

Tipos:

```text
CHECKING
SAVINGS
CREDIT_CARD
CASH
DIGITAL_WALLET
OTHER
```

---

# 11. Transfers

Los movimientos entre cuentas NO deben considerarse gastos.

Ejemplo:

```text
BBVA Débito
-$2,000

        ↓ TRANSFER

BBVA Crédito
+$2,000
```

Resultado:

```text
Gasto real = $0
Transferencia = $2,000
```

Esto es indispensable para estadísticas y liquidez correctas.

---

# 12. Deduplication Engine

No confiar únicamente en:

```text
amount + date
```

Utilizar:

```text
account
+
amount
+
currency
+
date
+
merchant
+
transaction type
```

para crear un fingerprint.

Además utilizar matching aproximado para encontrar transacciones similares.

Ejemplo:

```text
Notification:
Amazon $1,299

Email:
Amazon $1,299

Statement:
AMZN Mktp $1,299
```

Debe convertirse en:

```text
1 transaction

Sources:
✓ Notification
✓ Email
✓ Statement
```

No en tres transacciones.

---

# 13. Reconciliation Engine

El sistema debe reconciliar transacciones provenientes de diferentes fuentes.

Estados conceptuales:

```text
CANDIDATE
↓
MATCHED
↓
CONFIRMED
```

También debe manejar:

```text
PENDING
POSTED
REFUND
TRANSFER
DUPLICATE
REJECTED
```

---

# 14. Confidence System

Cada transacción debe tener un nivel de confianza.

Ejemplo:

```text
99% — Statement + Email + Notification
95% — Statement
90% — Notification perfectamente parseada
70% — Email ambiguo
40% — OCR ambiguo
```

Reglas iniciales:

```text
confidence >= 90
→ registrar automáticamente

70 <= confidence < 90
→ registrar + solicitar revisión

confidence < 70
→ no confirmar automáticamente
→ solicitar al usuario
```

El sistema debe permitir modificar posteriormente estos thresholds.

---

# 15. Merchant Normalization

Normalizar nombres de comercios.

Ejemplo:

```text
AMZN Mktp US
AMAZON MX
Amazon Marketplace
AMZN*12345

        ↓

Amazon
```

Otro ejemplo:

```text
UBER *TRIP
Uber Trip
UBER MX

        ↓

Uber
```

La normalización debe separar:

```text
raw_merchant
normalized_merchant
```

Nunca destruir la información original.

---

# 16. Categorization

El sistema debe categorizar transacciones utilizando:

1. Reglas.
2. Historial del usuario.
3. Merchant normalization.
4. Posteriormente ML/LLM si es necesario.

Ejemplo:

```text
STARBUCKS
→ Food

UBER
→ Transportation

NETFLIX
→ Entertainment

AMAZON
→ Shopping
```

---

# 17. Learning from User Corrections

Cuando el usuario cambie una categoría:

```text
Amazon
Shopping → Technology
```

guardar la corrección como regla/preferencia.

Posteriormente:

```text
Amazon
→ Technology
```

automáticamente.

No comenzar con ML complejo.

Primero:

```text
Rules
+
User Corrections
+
Merchant Mapping
```

Después evaluar ML/LLM.

---

# 18. Email Ingestion

El sistema debe poder obtener emails financieros de:

```text
Gmail
Outlook
```

Proceso:

```text
Email
↓
Provider Detection
↓
Financial Email Detection
↓
Parser
↓
Transaction Candidate
↓
Normalization
↓
Deduplication
↓
Reconciliation
```

Guardar solamente la información necesaria para el funcionamiento de la aplicación cuando sea posible.

---

# 19. Statement Ingestion

## PDF

Proceso:

```text
Upload PDF
↓
Detect Bank
↓
Extract Text/Table
↓
Bank-specific Parser
↓
Transaction Candidates
↓
Normalize
↓
Deduplicate
↓
Reconcile
```

Priorizar:

```text
PDF text extraction
+
Regex
+
Table extraction
+
Bank-specific parsers
```

No utilizar LLM para todos los PDFs.

Utilizar IA solamente cuando el formato sea ambiguo o no pueda resolverse mediante parsing tradicional.

---

# 20. CSV / XLSX

Proceso:

```text
Upload
↓
Detect columns
↓
Map columns
↓
Normalize
↓
Deduplicate
↓
Reconcile
```

Debe permitir mapear columnas cuando el formato no sea reconocido automáticamente.

---

# 21. Cash

El efectivo debe tratarse como una cuenta:

```text
CASH
```

Ejemplo:

```text
ATM withdrawal

BBVA Debit
-$1,000

Cash
+$1,000
```

Después:

```text
Cash
-$250
Food
```

Esto permite que los balances siempre sean consistentes.

---

# 22. Quick Entry

El registro manual debe ser extremadamente rápido.

Tipos:

```text
Expense
Income
Transfer
Loan
Loan Payment
Cash
```

Objetivo:

```text
menos de 3 taps
```

El registro manual NO debe desaparecer. Debe funcionar como fallback cuando una fuente automática no existe.

---

# 23. Liquidity Engine

Separar:

### Balance

Dinero total registrado.

### Real Liquidity

Dinero realmente disponible después de obligaciones.

### Projected Liquidity

Liquidez considerando ingresos y gastos futuros.

Conceptualmente:

```text
Liquid Assets
+
Expected Income
-
Credit Obligations
-
Committed Expenses
=
Projected Liquidity
```

La lógica debe utilizar tipos numéricos adecuados para evitar errores de punto flotante.

---

# 24. Future Obligations

Permitir registrar:

```text
Rent
Netflix
Internet
Subscriptions
Loans
Credit card payments
Other recurring expenses
```

Y:

```text
Salary
Recurring income
Other expected income
```

Esto permite proyectar liquidez futura.

---

# 25. Budget Engine

Sistema de sobres/categorías.

Ejemplo:

```text
Food          20%
Transportation 10%
Entertainment 10%
Savings       30%
Other         30%
```

Regla:

```text
Total percentages <= 100%
```

Cuando se registra un gasto:

```text
Expense
↓
Category
↓
Budget
↓
Available budget decreases
```

---

# 26. Loans / Shared Expenses

Modelo:

```text
User
Contact
Loan
Loan Payment
```

Ejemplo:

```text
Cena: $1,000

Usuario:
$400

Juan:
$300

Pedro:
$300
```

Las cantidades de terceros se convierten en cuentas por cobrar.

Los pagos parciales reducen la deuda.

Ejemplo:

```text
Juan debe $300

Paga $100

Debt:
$200
```

Los $100 recibidos aumentan la liquidez.

---

# 27. Dashboard

El dashboard debe priorizar:

```text
REAL LIQUIDITY
```

Después:

```text
Available Cash
Credit Obligations
Upcoming Income
Upcoming Expenses
Monthly Spending
Budget Consumption
Loans Receivable
```

La información debe ser accionable, no únicamente visual.

---

# 28. Automation Engine

Posteriormente soportar reglas como:

```text
IF merchant == Uber
THEN category = Transportation
```

```text
IF merchant == Amazon
THEN category = Shopping
```

```text
IF transaction > $2,000
THEN require_confirmation
```

```text
IF category_usage >= 80%
THEN notify_user
```

```text
IF recurring_salary_detected
THEN classify_as_income
```

---

# 29. Notifications / Alerts

Implementar:

### Budget alerts

```text
80% consumed
100% consumed
>100% consumed
```

### Credit card

```text
3 days before due date
```

### Cash flow

```text
Upcoming negative balance
```

### Transaction review

```text
Low confidence transaction
```

---

# 30. Development Roadmap

## PHASE 1 — Foundation

- React Native + Expo
- TypeScript
- Supabase
- Authentication
- Database
- Secure local storage
- Accounts
- Transactions

## PHASE 2 — Manual Finance Engine

- Manual transaction creation
- Income
- Expenses
- Transfers
- Credit cards
- Cash
- Categories
- Basic dashboard
- Liquidity calculation

## PHASE 3 — Android Automation

- Native Android module
- NotificationListenerService
- Notification ingestion
- BBVA parser
- Additional bank parsers
- Raw events
- Transaction candidates

## PHASE 4 — Normalization & Reconciliation

- Merchant normalization
- Deduplication
- Cross-source reconciliation
- Confidence score
- Transaction states
- User corrections

## PHASE 5 — Email & Statements

- Gmail
- Outlook
- PDF
- CSV
- XLSX

## PHASE 6 — Financial Intelligence

- Automatic categorization
- User rules
- Recurring transactions
- Future obligations
- Cash flow projection
- Projected liquidity

## PHASE 7 — Advanced Features

- Budgets
- Loans
- Shared expenses
- Alerts
- OCR
- ML/LLM
- Additional financial providers
- Wallet integrations
- Bank APIs/Open Banking

---

# 31. Critical Development Rules

## Rule 1

Do not tightly couple the UI to data ingestion.

The UI consumes normalized financial data.

```text
Source → Ingestion → Normalization → DB → UI
```

Never:

```text
Notification → UI → DB
```

---

## Rule 2

Never assume one source is authoritative.

Multiple sources may describe the same transaction.

Use reconciliation.

---

## Rule 3

Never delete raw financial events unnecessarily.

Raw data should remain available for debugging and reprocessing, subject to privacy/security requirements.

---

## Rule 4

Never treat transfers as expenses.

Transfers only move money between accounts.

---

## Rule 5

Never rely exclusively on LLMs for deterministic financial parsing.

Prefer:

```text
Rules
Regex
Parsers
Structured extraction
```

Use AI when ambiguity requires it.

---

## Rule 6

Financial calculations must be deterministic.

Avoid floating-point errors.

Use integer minor units or decimal/numeric database types.

Example:

```text
$10.50

stored as:
1050 cents
```

or PostgreSQL `numeric`.

---

## Rule 7

Security and privacy are first-class requirements.

Financial data is sensitive.

Use:

- Supabase RLS
- Encrypted transport
- Secure local storage
- Minimal data retention
- Explicit user permissions
- No unnecessary financial data sharing

---

## Rule 8

Every external integration must be an adapter.

Do not contaminate the core transaction engine with provider-specific logic.

---

# 32. Definition of Done for Automatic Transaction

Una transacción automática se considera correctamente procesada cuando:

```text
Source detected
        ↓
Raw event stored
        ↓
Parser executed
        ↓
Amount extracted
        ↓
Date extracted
        ↓
Account identified
        ↓
Merchant normalized
        ↓
Transaction type determined
        ↓
Duplicate check
        ↓
Cross-source reconciliation
        ↓
Category assigned
        ↓
Confidence calculated
        ↓
Transaction confirmed
```

Resultado final:

```text
1 reliable normalized transaction
```

independientemente de cuántas fuentes originales la hayan generado.

---

# 33. Core Product Philosophy

La aplicación debe evolucionar de:

```text
Expense Tracker
```

a:

```text
Personal Financial Data Engine
```

El objetivo no es que el usuario registre mejor sus gastos.

El objetivo es que:

> **el usuario prácticamente no tenga que registrarlos.**

La aplicación debe observar, entender, normalizar y reconciliar su información financiera, dejando al usuario únicamente las decisiones financieras y las excepciones que realmente requieran intervención.
