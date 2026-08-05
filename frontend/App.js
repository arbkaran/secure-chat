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

import * as Notifications from 'expo-notifications';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ActiveChatProvider } from './context/ActiveChatContext';
import { ThemeProvider } from './theme';
import RootNavigator from './navigation/RootNavigator';
import AppSplashScreen from './screens/AppSplashScreen';
import { navigate } from './navigation/navigationRef';
import { requestNotificationPermissions } from './api/notifications';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
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

  useEffect(() => {
    requestNotificationPermissions().catch(() => {});

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const { senderId, senderName } = response.notification.request.content.data ?? {};
      if (senderId) {
        navigate('Chats', {
          screen: 'Chat',
          params: {
            contact: {
              id: String(senderId),
              name: senderName ?? 'Unknown',
              initials: (senderName ?? '?').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2),
              status: 'offline',
            },
          },
        });
      }
    });

    return () => sub.remove();
  }, []);

  if (!fontsLoaded) {
    return <AppSplashScreen />;
  }

  return (
    <View style={styles.root}>
      <ThemeProvider>
        <AuthProvider>
          <ActiveChatProvider>
            <ToastProvider>
              <RootNavigator />
            </ToastProvider>
          </ActiveChatProvider>
        </AuthProvider>
      </ThemeProvider>
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
