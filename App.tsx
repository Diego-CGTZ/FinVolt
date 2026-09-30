import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AuthProvider, useAuth } from './src/application/state/AuthContext';
import { AccountsProvider } from './src/application/state/AccountsContext';
import { CategoriesProvider } from './src/application/state/CategoriesContext';
import { TransactionsProvider } from './src/application/state/TransactionsContext';
import { NotificationProvider } from './src/application/state/NotificationContext';
import { AuthScreen } from './src/presentation/screens/AuthScreen';
import { AccountsScreen } from './src/presentation/screens/AccountsScreen';
import { AddExpenseScreen } from './src/presentation/screens/AddExpenseScreen';
import { HomeScreen } from './src/presentation/screens/HomeScreen';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { TouchableOpacity, Text } from 'react-native';

function MainTabs() {
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'ACCOUNTS' | 'TRANSACTIONS'>('DASHBOARD');

  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
      <View style={{ flex: 1 }}>
        {activeTab === 'DASHBOARD' ? (
          <HomeScreen onNavigateTab={(tab) => setActiveTab(tab)} />
        ) : activeTab === 'ACCOUNTS' ? (
          <AccountsScreen />
        ) : (
          <AddExpenseScreen />
        )}
      </View>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'DASHBOARD' && styles.tabButtonActive]}
          onPress={() => setActiveTab('DASHBOARD')}
        >
          <Ionicons
            name={activeTab === 'DASHBOARD' ? 'pie-chart' : 'pie-chart-outline'}
            size={22}
            color={activeTab === 'DASHBOARD' ? '#6366f1' : '#94a3b8'}
            style={styles.tabIcon}
          />
          <Text style={[styles.tabText, activeTab === 'DASHBOARD' && styles.tabTextActive]}>
            Inicio
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'ACCOUNTS' && styles.tabButtonActive]}
          onPress={() => setActiveTab('ACCOUNTS')}
        >
          <Ionicons
            name={activeTab === 'ACCOUNTS' ? 'wallet' : 'wallet-outline'}
            size={22}
            color={activeTab === 'ACCOUNTS' ? '#6366f1' : '#94a3b8'}
            style={styles.tabIcon}
          />
          <Text style={[styles.tabText, activeTab === 'ACCOUNTS' && styles.tabTextActive]}>
            Cuentas
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'TRANSACTIONS' && styles.tabButtonActive]}
          onPress={() => setActiveTab('TRANSACTIONS')}
        >
          <Ionicons
            name={activeTab === 'TRANSACTIONS' ? 'receipt' : 'receipt-outline'}
            size={22}
            color={activeTab === 'TRANSACTIONS' ? '#6366f1' : '#94a3b8'}
            style={styles.tabIcon}
          />
          <Text style={[styles.tabText, activeTab === 'TRANSACTIONS' && styles.tabTextActive]}>
            Movimientos
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * Root navigator — switches between AuthScreen and MainTabs
 * based on the current auth state from AuthContext.
 */
function RootNavigator() {
  const { authState } = useAuth();

  if (authState.status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (authState.status === 'authenticated') {
    return (
      <AccountsProvider>
        <CategoriesProvider>
          <TransactionsProvider>
            <NotificationProvider>
              <MainTabs />
            </NotificationProvider>
          </TransactionsProvider>
        </CategoriesProvider>
      </AccountsProvider>
    );
  }

  return <AuthScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    paddingBottom: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  tabButtonActive: {
    borderTopWidth: 2,
    borderTopColor: '#6366f1',
    marginTop: -10,
    paddingTop: 12,
  },
  tabIcon: {
    marginBottom: 4,
  },
  tabText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#6366f1',
    fontWeight: '700',
  },
});

