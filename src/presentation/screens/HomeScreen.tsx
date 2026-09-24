import React from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

/**
 * Placeholder screen shown after successful authentication.
 * This will be replaced by the full financial dashboard in US-017.
 */
export function HomeScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.container}>
        <Text style={styles.logo}>⚡</Text>
        <Text style={styles.title}>FinVolt</Text>
        <Text style={styles.subtitle}>Dashboard</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Próximamente</Text>
        </View>
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
});
