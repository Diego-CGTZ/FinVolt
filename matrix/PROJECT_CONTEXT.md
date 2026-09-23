# Personal Finance App — Project Context & Development Rules

## 1. Product Vision

Build a **Personal Financial Data Engine**, not a simple expense tracker.

The system must automatically collect financial information from multiple sources, preserve the original data, parse it, normalize it, reconcile duplicates and cross-source information, classify transactions, calculate confidence, and only request user intervention when necessary.

Core pipeline:

`Sources → Ingestion → Raw Events → Parsing → Normalization → Reconciliation → Transactions → Classification → Financial Intelligence → UI`

The primary automation metric is:

`Automatically registered transactions / Total transactions`

The long-term goal is that the user rarely needs to manually register transactions.

---

## 2. Core Architecture

The UI must never be directly coupled to external financial sources.

Use this separation:

`Source → Adapter → Ingestion → Raw Event → Candidate → Normalization → Reconciliation → Transaction → UI`

Every external integration must be implemented as an independent adapter. Provider-specific logic must never contaminate the core financial domain.

Initial sources:

- Android bank/card notifications
- Gmail / Outlook
- PDF / CSV / XLSX statements
- Manual entries

Future sources must be pluggable without redesigning the core: Wallets, Open Banking, bank APIs, OCR, and other providers.

Wallet integrations and any individual provider must never become a fundamental dependency.

---

## 3. Financial Domain Rules

Use a canonical transaction model with, at minimum:

`account, type, amount, currency, occurred_at, posted_at, merchant, description, category, source, source_event, status, confidence_score, fingerprint`

Supported transaction types must include:

`EXPENSE, INCOME, TRANSFER, CARD_PAYMENT, REFUND, CASH_WITHDRAWAL, LOAN, LOAN_PAYMENT, ADJUSTMENT`

Transfers are movements of money between accounts and are **never expenses**.

Financial accounts must support:

`CHECKING, SAVINGS, CREDIT_CARD, CASH, DIGITAL_WALLET, OTHER`

Cash is a real account.

Credit cards must be modeled separately from checking/savings accounts.

All monetary calculations must be deterministic. Prefer PostgreSQL `numeric` or integer minor units; never rely on floating-point arithmetic for financial values.

---

## 4. Raw Data and Reconciliation

External information must never be inserted directly into the final `transactions` table.

Always preserve the original event:

`External Source → Raw Event → Processing`

Raw events must remain available for auditing, debugging and reprocessing, subject to security and privacy requirements.

Multiple sources may describe the same transaction. The system must reconcile them instead of creating duplicates.

Deduplication should use a combination of:

`account + amount + currency + date + merchant + transaction type`

plus approximate matching when appropriate.

Example:

`Amazon notification + Amazon email + AMZN statement = one transaction with multiple sources`

---

## 5. Normalization and Classification

Merchant data must preserve both:

`raw_merchant` and `normalized_merchant`

Example:

`AMZN Mktp US / AMAZON MX / AMZN*12345 → Amazon`

Classification should initially rely on deterministic mechanisms:

`Merchant mappings + Rules + User corrections`

Do not introduce ML/LLM unnecessarily.

When the user corrects a classification, store the correction as a reusable rule/preference.

AI/LLM may be introduced later only for ambiguous cases where deterministic parsing or classification is insufficient.

---

## 6. Confidence and User Intervention

Every automatically generated transaction should have a confidence score.

Initial conceptual thresholds:

- `>= 90`: automatically confirm
- `70–89`: create and request review
- `< 70`: require user confirmation

Thresholds must remain configurable.

The system should optimize for **automation with controlled uncertainty**, not blind automation.

---

## 7. Development Strategy

Development must be incremental and story-driven.

The GitHub Project is the source of truth for implementation status.

Work on **exactly one User Story at a time**.

For every User Story:

`To Do → In Progress → In Review → Done`

Create one branch per story:

`feature/US-XXX-short-description`

The branch must be created from the latest `main`.

A story must contain clear acceptance criteria and must be independently testable.

Do not implement future stories prematurely or add unrelated functionality.

Before a story can be considered complete:

- Implementation finished
- Tests added/updated
- Lint passes
- Typecheck passes
- Build passes
- Architecture rules respected
- Code reviewed
- Branch merged into `main`

Only after the story is merged into `main` may development of the next story begin.

`main` must always represent the latest stable state of the product.

---

## 8. Implementation Priority

Development should proceed in vertical increments:

1. Project foundation and architecture
2. Supabase, authentication and security
3. Accounts, categories and canonical transactions
4. Manual expenses, income, transfers, credit cards and cash
5. Basic dashboard and real liquidity
6. Android notification ingestion
7. Raw events and provider adapters
8. Financial parsing
9. Merchant normalization
10. Deduplication and reconciliation
11. Confidence and classification
12. Email and statement ingestion
13. Recurring transactions and projected liquidity
14. Budgets
15. Loans and shared expenses
16. Automation and alerts
17. OCR / ML / LLM
18. Additional providers and Open Banking

The first meaningful MVP should prioritize the complete financial pipeline over advanced features.

---

## 9. Technology Constraints

Initial stack:

- React Native
- Expo
- TypeScript
- Supabase
- PostgreSQL
- Supabase Auth
- Supabase Storage
- Supabase Edge Functions
- Node.js / TypeScript

Prefer serverless architecture and maintain development cost at approximately `$0` whenever technically possible.

Android may use native modules such as `NotificationListenerService`.

Do not assume equivalent notification access on iOS. iOS must primarily rely on email, files, manual entry and future APIs.

---

## 10. Security and Privacy

Financial information is sensitive.

Always prioritize:

- Supabase RLS
- Secure authentication
- Encrypted transport
- Secure local storage
- Explicit permissions
- Minimal data retention
- No unnecessary sharing of financial information
- No secrets committed to the repository

Security must be considered part of every feature, not a later phase.

---

## 11. AI Development Behavior

Before implementing a User Story, inspect the existing repository and understand the current architecture.

Reuse existing abstractions when appropriate instead of creating parallel implementations.

Do not modify unrelated functionality.

Do not make architectural decisions solely to satisfy the current story if they would prevent future adapters, reconciliation, or financial-domain evolution.

Prefer simple deterministic solutions first.

When uncertain about a financial interpretation, preserve the raw information and create a candidate requiring review rather than inventing data.

The AI must optimize for:

`Correctness > Data Integrity > Security > Maintainability > Automation > Convenience`

The ultimate architectural objective is:

**One reliable, normalized financial history regardless of how many original sources generated the information.**
