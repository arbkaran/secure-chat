import { useColorScheme } from 'react-native';

// Brand palette extracted from logo gradient:
//   Cyan highlight  #0CB8D8
//   Brand blue      #1258B4  ← primary accent
//   Deep navy       #0D1C70

export const darkColors = {
  background:   '#0A0A0A',
  screen:       '#0A0A0A',
  surface:      '#0A0A0A',
  surfaceAlt:   '#0A0A0A',
  border:       '#2A2A2A',
  accent:       '#2870D4',
  accentSoft:   'rgba(40, 112, 212, 0.18)',
  accentBorder: 'rgba(40, 112, 212, 0.30)',
  online:       '#0CB8D8',
  destructive:  '#EF4444',
  textPrimary:  '#F0F0F0',
  textSecondary:'#A0A0A0',
  textTertiary: '#606060',
  onAccent:     '#FFFFFF',
  searchBg:     '#161616',
  tabBarBg:     '#161616',
  chatInputBg:  '#161616',
};

export const lightColors = {
  background:   '#F2F6FF', // blue-tinted off-white
  screen:       '#FFFFFF',
  surface:      '#FFFFFF',
  surfaceAlt:   '#EAF1FF', // light blue wash
  border:       '#C6D8F8', // soft blue border
  accent:       '#1258B4', // brand blue (mid-gradient)
  accentSoft:   'rgba(18, 88, 180, 0.10)',
  accentBorder: 'rgba(18, 88, 180, 0.25)',
  online:       '#0CB8D8', // cyan from logo
  destructive:  '#EF4444',
  textPrimary:  '#08142E', // near-black navy
  textSecondary:'#3B5D96', // mid navy
  textTertiary: '#7A98C8', // light blue-gray
  onAccent:     '#FFFFFF',
  searchBg:     '#F1F1F1',
  tabBarBg:     '#FFFFFF',
  chatInputBg:  '#FFFFFF',
};

export const spacing = {
  micro:   4,
  tight:   8,
  default: 16,
  section: 24,
  screen:  32,
};

export const radius = {
  control: 12,
  card:    20,
  screen:  32,
  pill:    999,
};

export const typography = {
  screenTitle:   { fontFamily: 'Inter_700Bold',    fontSize: 28, letterSpacing: -0.02 * 28 },
  sectionHeader: { fontFamily: 'Inter_600SemiBold', fontSize: 18 },
  body:          { fontFamily: 'Inter_400Regular',  fontSize: 15 },
  label:         { fontFamily: 'Inter_500Medium',   fontSize: 13 },
  caption:       { fontFamily: 'Inter_400Regular',  fontSize: 11 },
};

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = isDark ? darkColors : lightColors;
  return { colors, spacing, radius, typography, isDark };
}
