import { NavigationContainer, DarkTheme, DefaultTheme, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { navigationRef } from './navigationRef';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import OtpVerifyScreen from '../screens/OtpVerifyScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
import ContactsScreen from '../screens/ContactsScreen';
import ChatScreen from '../screens/ChatScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useWindowDimensions, Platform } from 'react-native';
import DesktopDashboard from '../screens/DesktopDashboard';

const AuthStackNav = createNativeStackNavigator();
const ChatsStack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function AuthStack() {
  return (
    <AuthStackNav.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
      <AuthStackNav.Screen name="Login" component={LoginScreen} />
      <AuthStackNav.Screen name="Register" component={RegisterScreen} />
      <AuthStackNav.Screen name="OtpVerify" component={OtpVerifyScreen} />
      <AuthStackNav.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <AuthStackNav.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </AuthStackNav.Navigator>
  );
}

function ChatsStackNavigator() {
  return (
    <ChatsStack.Navigator screenOptions={{ headerShown: false }}>
      <ChatsStack.Screen name="ContactsList" component={ContactsScreen} />
      <ChatsStack.Screen name="Chat" component={ChatScreen} />
    </ChatsStack.Navigator>
  );
}

function MainTabs() {
  const { colors } = useTheme();
  const tabBarBase = { backgroundColor: colors.tabBarBg, borderTopColor: colors.border };

  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
      }}
    >
      <Tabs.Screen
        name="Chats"
        component={ChatsStackNavigator}
        options={({ route }) => {
          const focusedRouteName = getFocusedRouteNameFromRoute(route) ?? 'ContactsList';
          return {
            tabBarStyle: { ...tabBarBase, display: focusedRouteName === 'Chat' ? 'none' : 'flex' },
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'} size={size} color={color} />
            ),
          };
        }}
      />
      <Tabs.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarStyle: tabBarBase,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs.Navigator>
  );
}

export default function RootNavigator() {
  const { isLoggedIn } = useAuth();
  const { colors, isDark } = useTheme();

  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 768;

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.screen,
      card: colors.screen,
      border: colors.border,
      primary: colors.accent,
      text: colors.textPrimary,
    },
  };

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {isLoggedIn ? (isDesktop ? <DesktopDashboard /> : <MainTabs />) : <AuthStack />}
    </NavigationContainer>
  );
}
