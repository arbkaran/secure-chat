import { useEffect } from 'react';
import { View, Platform, StyleSheet } from 'react-native';

import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';

import { AuthProvider } from './context/AuthContext';
import RootNavigator from './navigation/RootNavigator';
import { useTheme } from './theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const { colors } = useTheme();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  return (
    <View style={styles.root}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    height: Platform.OS === 'web' ? '100vh' : '100%',
    width: '100%',
  },
});


