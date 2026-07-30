import { useMemo } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

export default function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  rightIcon,
  onRightIconPress,
  keyboardType = 'default',
  autoCapitalize = 'none',
  style,
}) {
  const { colors, radius, spacing } = useTheme();
  const styles = useMemo(() => createStyles(colors, radius, spacing), [colors, radius, spacing]);

  return (
    <View style={style}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.field}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          style={styles.input}
        />
        {rightIcon ? (
          <Pressable onPress={onRightIconPress} hitSlop={8}>
            {rightIcon}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(colors, radius, spacing) {
  return StyleSheet.create({
    label: {
      color: colors.textSecondary,
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
      marginBottom: spacing.tight,
    },
    field: {
      height: 52,
      borderRadius: radius.control,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.default,
      marginBottom: spacing.default,
    },
    input: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 15,
      fontFamily: 'Inter_400Regular',
      paddingVertical: 0,
    },
  });
}
