export type AccountType =
  'CHECKING' | 'SAVINGS' | 'CREDIT_CARD' | 'CASH' | 'DIGITAL_WALLET' | 'OTHER';

export interface Account {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  currency: string;
  initialBalance: number;
  createdAt: Date;
  updatedAt: Date;
}
