import { useColorScheme } from 'react-native';

// Design tokens extracted from SecureChat.dc.html (dark) with a matching
// light palette derived for the same roles.

export const darkColors = {
  background: '#0F172A', // Slate 900
  screen: '#1E293B',     // Slate 800
  surface: '#1E293B',    // Slate 800
  surfaceAlt: '#0F172A', // Slate 900
  border: '#334155',     // Slate 700
  accent: '#3B82F6',     // Blue 500
  accentSoft: 'rgba(59, 130, 246, 0.15)',
  accentBorder: 'rgba(59, 130, 246, 0.3)',
  online: '#22C55E',
  destructive: '#EF4444',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textTertiary: '#64748B',
  onAccent: '#FFFFFF',
};

export const lightColors = {
  background: '#F8FAFC',
  screen: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F5F9',
  border: '#E2E8F0',
  accent: '#2563EB',
  accentSoft: 'rgba(37, 99, 235, 0.1)',
  accentBorder: 'rgba(37, 99, 235, 0.25)',
  online: '#22C55E',
  destructive: '#EF4444',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textTertiary: '#94A3B8',
  onAccent: '#FFFFFF',
};

export const spacing = {
  micro: 4,
  tight: 8,
  default: 16,
  section: 24,
  screen: 32,
};

export const radius = {
  control: 12,
  card: 20,
  screen: 32,
  pill: 999,
};

export const typography = {
  screenTitle: { fontFamily: 'Inter_700Bold', fontSize: 28, letterSpacing: -0.02 * 28 },
  sectionHeader: { fontFamily: 'Inter_600SemiBold', fontSize: 18 },
  body: { fontFamily: 'Inter_400Regular', fontSize: 15 },
  label: { fontFamily: 'Inter_500Medium', fontSize: 13 },
  caption: { fontFamily: 'Inter_400Regular', fontSize: 11 },
};

// Falls back to light blue mode unless system is explicitly set to dark.
export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = isDark ? darkColors : lightColors;
  return { colors, spacing, radius, typography, isDark };
}
