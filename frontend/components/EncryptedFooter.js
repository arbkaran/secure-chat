import { View, Text, StyleSheet } from 'react-native';
import { ShieldIcon } from './icons';
import { useTheme } from '../theme';

export default function EncryptedFooter() {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      <ShieldIcon size={12} color={colors.textTertiary} />
      <Text style={[styles.text, { color: colors.textTertiary }]}>End-to-end encrypted</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
  },
  text: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
});
