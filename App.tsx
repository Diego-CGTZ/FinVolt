import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AuthProvider, useAuth } from './src/application/state/AuthContext';
import { AuthScreen } from './src/presentation/screens/AuthScreen';
import { HomeScreen } from './src/presentation/screens/HomeScreen';

/**
 * Root navigator — switches between AuthScreen and HomeScreen
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
    return <HomeScreen />;
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
