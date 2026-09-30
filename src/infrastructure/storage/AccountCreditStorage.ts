import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AccountCreditMetadata {
  creditLimit?: number;
  cutoffDay?: number;
  paymentDueDay?: number;
}

const STORAGE_KEY = '@finvolt_accounts_credit_metadata';

export class AccountCreditStorage {
  static async getAll(): Promise<Record<string, AccountCreditMetadata>> {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY);
      return json ? JSON.parse(json) : {};
    } catch {
      return {};
    }
  }

  static async get(accountId: string): Promise<AccountCreditMetadata | null> {
    const all = await this.getAll();
    return all[accountId] || null;
  }

  static async set(accountId: string, data: AccountCreditMetadata): Promise<void> {
    try {
      const all = await this.getAll();
      all[accountId] = { ...all[accountId], ...data };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
      console.error('Error saving account credit metadata:', e);
    }
  }

  static async remove(accountId: string): Promise<void> {
    try {
      const all = await this.getAll();
      delete all[accountId];
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
      console.error('Error removing account credit metadata:', e);
    }
  }
}
