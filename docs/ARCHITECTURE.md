# FinVolt — Architecture Document

## Overview

FinVolt follows **Clean Architecture** principles to ensure that business logic
is completely isolated from infrastructure details (database, network, device APIs)
and from the UI framework.

```
┌─────────────────────────────────────────────────┐
│                 PRESENTATION                     │
│   screens / components / hooks                   │
│   (React Native UI — depends on Application)    │
├─────────────────────────────────────────────────┤
│                 APPLICATION                      │
│   useCases / state / di                          │
│   (Orchestration — depends on Domain only)       │
├─────────────────────────────────────────────────┤
│                   DOMAIN                         │
│   models / repositories / services               │
│   (Core business logic — NO external deps)       │
├─────────────────────────────────────────────────┤
│                INFRASTRUCTURE                    │
│   api / database / adapters                      │
│   (Concrete implementations — depends on Domain) │
└─────────────────────────────────────────────────┘
```

## Layer Rules (enforced by convention and code review)

| Layer             | Can import from           | Cannot import from                        |
| ----------------- | ------------------------- | ----------------------------------------- |
| `domain/`         | Nothing (pure TS)         | infrastructure, application, presentation |
| `infrastructure/` | `domain/`                 | application, presentation                 |
| `application/`    | `domain/`                 | infrastructure, presentation              |
| `presentation/`   | `domain/`, `application/` | `infrastructure/` directly                |

> **Why?** If `presentation` ever imported `SupabaseAccountRepository` directly,
> we'd be tightly coupled to Supabase. By going through interfaces, we can swap
> the backend (or mock it in tests) without touching any screen.

## Directory Reference

```
src/
├── domain/
│   ├── models/         # Entities: Transaction, Account, Budget, Loan, Category
│   ├── repositories/   # Interfaces: IAccountRepository, ITransactionRepository
│   └── services/       # Interfaces: IFinancialSourceAdapter, INotificationParser
│
├── infrastructure/
│   ├── api/            # SupabaseClient, OpenBankingClient
│   ├── database/       # SupabaseAccountRepository, SupabaseTransactionRepository
│   └── adapters/       # NotificationAdapter, GmailAdapter, PdfAdapter
│
├── application/
│   ├── useCases/       # GetLiquidityUseCase, RecordExpenseUseCase, etc.
│   ├── state/          # React Contexts: AuthContext, AccountsContext, BudgetContext
│   └── di/             # ServiceContainer — wires interfaces to implementations
│
└── presentation/
    ├── screens/        # HomeScreen, AccountsScreen, AddExpenseScreen, BudgetScreen
    ├── components/     # BalanceCard, TransactionItem, BudgetBar (reusable UI)
    └── hooks/          # useAccounts, useTransactions, useLiquidity, useBudget
```

## Key Design Decisions

### Dependency Injection via React Context

We inject infrastructure implementations through a `ServiceContainer` exposed via
Context. This avoids heavy DI frameworks (tsyringe, inversify) while keeping the
code testable and replaceable.

### No Global State Library

React Context + custom hooks is sufficient for FinVolt's state needs. If state
complexity grows, a state library can be introduced without architectural changes
because state logic lives in `application/state/`, isolated from the UI.

### Financial Data Security

- All user financial data is stored in Supabase with **Row Level Security (RLS)**
  enforced at the database level (US-005).
- No secrets or credentials are ever stored on the client device.
- The app uses Supabase Auth JWT — tokens are managed by the SDK, not stored manually.

### Cost Model

- **Free tier**: Supabase free tier supports personal use at $0.
- **Scalable**: Moving to a paid Supabase plan enables multi-user deployment
  with no code changes — RLS already enforces data isolation per user.

## Future Issues Mapped to Architecture

| Issue                    | Layer affected                                                       |
| ------------------------ | -------------------------------------------------------------------- |
| US-003 Supabase setup    | `infrastructure/api/`, `infrastructure/database/`                    |
| US-004 Auth              | `infrastructure/api/`, `application/state/AuthContext`               |
| US-005 RLS               | Supabase config (no client code change)                              |
| US-006 Accounts model    | `domain/models/`, `domain/repositories/`, `infrastructure/database/` |
| US-008 Transaction model | `domain/models/`, `domain/repositories/`                             |
| US-016 Liquidity         | `application/useCases/GetLiquidityUseCase`                           |
| US-017 Dashboard         | `presentation/screens/HomeScreen`                                    |
| US-020 Notifications     | `infrastructure/adapters/NotificationAdapter`                        |
| US-033 Gmail             | `infrastructure/adapters/GmailAdapter`                               |
| US-046 Budgets           | `domain/models/Budget`, `application/useCases/`, `presentation/`     |
| US-049 Loans             | `domain/models/Loan`, `application/useCases/`, `presentation/`       |
