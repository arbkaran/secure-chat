import { View, Text, StyleSheet, Image } from 'react-native';
import { useTheme } from '../theme';

const PALETTE = [
  { bg: '#3A5A78', fg: '#D6E4F0' },
  { bg: '#6B4C8A', fg: '#EBDFF5' },
  { bg: '#3E6B5C', fg: '#D8F0E6' },
  { bg: '#7A5240', fg: '#F3DFCE' },
];

function paletteFor(initials) {
  const code = (initials || '').charCodeAt(0) || 0;
  return PALETTE[code % PALETTE.length];
}

export default function Avatar({ initials, size = 52, status, dimmed = false, imageUri }) {
  const { colors } = useTheme();
  const { bg, fg } = paletteFor(initials);
  const dotSize = Math.round(size * 0.25);

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: Math.round(size * 0.3),
            backgroundColor: dimmed ? colors.surface : bg,
            overflow: 'hidden',
          },
        ]}
      >
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={{ width: size, height: size, resizeMode: 'cover' }} />
        ) : (
          <Text style={[styles.initials, { fontSize: size * 0.32, color: dimmed ? colors.textTertiary : fg }]}>
            {initials}
          </Text>
        )}
      </View>
      {status ? (
        <View
          style={[
            styles.status,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: status === 'online' ? colors.online : 'transparent',
              borderColor: status === 'online' ? colors.screen : colors.textTertiary,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: 'Inter_600SemiBold',
  },
  status: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    borderWidth: 2,
  },
});
