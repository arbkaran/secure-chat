import { NavigationContainer, DarkTheme, DefaultTheme, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import OtpVerifyScreen from '../screens/OtpVerifyScreen';
import ContactsScreen from '../screens/ContactsScreen';
import ChatScreen from '../screens/ChatScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { ChatBubbleIcon, GearIcon } from '../components/icons';
import { useTheme } from '../theme';
import { useAuth } from '../context/AuthContext';

const AuthStackNav = createNativeStackNavigator();
const ChatsStack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function AuthStack() {
  return (
    <AuthStackNav.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
      <AuthStackNav.Screen name="Login" component={LoginScreen} />
      <AuthStackNav.Screen name="Register" component={RegisterScreen} />
      <AuthStackNav.Screen name="OtpVerify" component={OtpVerifyScreen} />
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
  const tabBarBase = { backgroundColor: colors.screen, borderTopColor: colors.border };

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
            tabBarIcon: ({ color, size, focused }) => <ChatBubbleIcon color={color} size={size} focused={focused} />,
          };
        }}
      />
      <Tabs.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarStyle: tabBarBase,
          tabBarIcon: ({ color, size, focused }) => <GearIcon color={color} size={size} focused={focused} />,
        }}
      />
    </Tabs.Navigator>
  );
}

export default function RootNavigator() {
  const { isLoggedIn } = useAuth();
  const { colors, isDark } = useTheme();

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
    <NavigationContainer theme={navTheme}>
      {isLoggedIn ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}
