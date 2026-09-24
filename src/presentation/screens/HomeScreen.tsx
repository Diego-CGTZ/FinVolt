import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../application/state/AuthContext';

/**
 * Placeholder home screen shown after successful authentication.
 * Will be replaced by the full Dashboard in US-017.
 */
export function HomeScreen() {
  const { user, signOut } = useAuth();

  async function handleSignOut() {
    try {
      await signOut();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al cerrar sesión';
      Alert.alert('Error', message);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>⚡ FinVolt</Text>
      <Text style={styles.welcome}>Bienvenido</Text>
      <Text style={styles.email}>{user?.email}</Text>
      <TouchableOpacity id="home-signout" style={styles.button} onPress={handleSignOut}>
        <Text style={styles.buttonText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  logo: {
    fontSize: 36,
    fontWeight: '800',
    color: '#f8fafc',
  },
  welcome: {
    fontSize: 20,
    color: '#94a3b8',
    marginTop: 8,
  },
  email: {
    fontSize: 16,
    color: '#6366f1',
    fontWeight: '600',
  },
  button: {
    marginTop: 32,
    backgroundColor: '#dc2626',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
