import { SafeAreaView, StyleSheet, Platform } from 'react-native';

import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../theme';

export default function ScreenContainer({ children, style }) {
  const { colors, isDark } = useTheme();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.screen }, style]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: Platform.OS === 'web' ? '100vh' : undefined,
  },
});

