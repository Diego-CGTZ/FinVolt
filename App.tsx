import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AuthProvider, useAuth } from './src/application/state/AuthContext';
import { AccountsProvider } from './src/application/state/AccountsContext';
import { CategoriesProvider } from './src/application/state/CategoriesContext';
import { AuthScreen } from './src/presentation/screens/AuthScreen';
import { AccountsScreen } from './src/presentation/screens/AccountsScreen';

/**
 * Root navigator — switches between AuthScreen and AccountsScreen
 * based on the current auth state from AuthContext.
 *
 * Navigation (US-navigation) will replace this simple switch
 * once a proper navigator is introduced.
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
    // We render AccountsScreen for now to satisfy US-006 until Expo Router is set up
    return (
      <AccountsProvider>
        <CategoriesProvider>
          <AccountsScreen />
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
});
