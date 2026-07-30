import { useColorScheme } from 'react-native';

// Design tokens extracted from SecureChat.dc.html (dark) with a matching
// light palette derived for the same roles.

export const darkColors = {
  background: '#0B0F13',
  screen: '#10151B',
  surface: '#171E26',
  surfaceAlt: '#1B222B',
  border: '#232B35',
  accent: '#4FB8AE',
  accentSoft: 'rgba(79,184,174,0.15)',
  accentBorder: 'rgba(79,184,174,0.25)',
  online: '#4CAF7D',
  destructive: '#C97A73',
  textPrimary: '#EDF1F5',
  textSecondary: '#8B97A5',
  textTertiary: '#5B6572',
  onAccent: '#0B0F13',
};

export const lightColors = {
  background: '#EDF0F3',
  screen: '#FFFFFF',
  surface: '#F3F5F8',
  surfaceAlt: '#E9EDF1',
  border: '#E1E6EB',
  accent: '#1F8478',
  accentSoft: 'rgba(31,132,120,0.12)',
  accentBorder: 'rgba(31,132,120,0.30)',
  online: '#2FA06A',
  destructive: '#B8493E',
  textPrimary: '#12181F',
  textSecondary: '#57626D',
  textTertiary: '#8A94A0',
  onAccent: '#0B0F13',
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

// Falls back to dark when the system reports no preference (`null`), since
// that's this app's default aesthetic and matches the original design file.
export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  const colors = isDark ? darkColors : lightColors;
  return { colors, spacing, radius, typography, isDark };
}
