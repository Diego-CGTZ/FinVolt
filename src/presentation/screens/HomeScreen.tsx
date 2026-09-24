import React from 'react';
import { Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../application/state/AuthContext';

/**
 * Placeholder screen shown after successful authentication.
 * This will be replaced by the full financial dashboard in US-017.
 *
 * Sign-out is kept here to satisfy the US-004 logout AC.
 */
export function HomeScreen() {
  const { user, signOut } = useAuth();

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      Alert.alert('Error', 'No se pudo cerrar sesión. Intenta de nuevo.');
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.container}>
        <Text style={styles.logo}>⚡</Text>
        <Text style={styles.title}>FinVolt</Text>
        <Text style={styles.subtitle}>Dashboard</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Próximamente</Text>
        </View>

        {user && <Text style={styles.email}>{user.email}</Text>}

        <TouchableOpacity id="home-signout" style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  logo: {
    fontSize: 56,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
  },
  badge: {
    marginTop: 16,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  badgeText: {
    color: '#6366f1',
    fontSize: 13,
    fontWeight: '600',
  },
  email: {
    marginTop: 8,
    fontSize: 13,
    color: '#475569',
  },
  signOutButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  signOutText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
});
