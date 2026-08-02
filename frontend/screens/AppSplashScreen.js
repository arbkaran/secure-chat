import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function AppSplashScreen() {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 340,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        tension: 55,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <LinearGradient
      colors={['#0CB8D8', '#1258B4', '#0D1C70']}
      start={{ x: 0.2, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={styles.container}
    >
      {/* Centered icon */}
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <Image
          source={require('../assets/icon.png')}
          style={styles.icon}
          resizeMode="contain"
        />
      </Animated.View>

      {/* App name pinned to bottom */}
      <Animated.View style={[styles.footer, { opacity }]}>
        <Text style={styles.appName}>SecureChat</Text>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 160,
    height: 160,
  },
  footer: {
    position: 'absolute',
    bottom: 52,
    alignItems: 'center',
    gap: 4,
  },
  appName: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
