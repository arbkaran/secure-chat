import { useMemo } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

export default function Button({ title, onPress, variant = 'primary', disabled = false, style }) {
  const { colors, radius, spacing } = useTheme();
  const styles = useMemo(() => createStyles(colors, radius, spacing), [colors, radius, spacing]);
  const isPrimary = variant === 'primary' && !disabled;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.label, isPrimary ? styles.labelPrimary : styles.labelDisabled]}>{title}</Text>
    </Pressable>
  );
}

function createStyles(colors, radius, spacing) {
  return StyleSheet.create({
    base: {
      height: 52,
      borderRadius: radius.control,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.default,
    },
    primary: {
      backgroundColor: colors.accent,
    },
    disabled: {
      backgroundColor: colors.border,
    },
    pressed: {
      opacity: 0.85,
    },
    label: {
      fontSize: 15,
      fontFamily: 'Inter_700Bold',
    },
    labelPrimary: {
      color: colors.onAccent,
    },
    labelDisabled: {
      color: colors.textTertiary,
    },
  });
}
