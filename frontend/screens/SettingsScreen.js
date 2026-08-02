import { useMemo, useState, useEffect } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView,
  Switch, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenContainer from '../components/ScreenContainer';
import Avatar from '../components/Avatar';
import { ChevronRightIcon, EyeIcon } from '../components/icons';
import { useTheme } from '../theme';
import { useAuth } from '../context/AuthContext';
import { getStoredEmail, getStoredPassword } from '../api/authStorage';
import { fetchCurrentUser } from '../api/client';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { useToast } from '../context/ToastContext';

// Coloured badge wrapper around an Ionicons icon (like WhatsApp)
function IconBadge({ name, color }) {
  return (
    <View style={[badge.wrap, { backgroundColor: color }]}>
      <Ionicons name={name} size={17} color="#fff" />
    </View>
  );
}
const badge = StyleSheet.create({
  wrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// A single settings row
function Row({ icon, iconColor = '#555', label, right, onPress, divider = true, colors }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        rowS.row,
        { borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.surfaceAlt },
      ]}
    >
      <IconBadge name={icon} color={iconColor} />
      <Text style={[rowS.label, { color: colors.textPrimary }]}>{label}</Text>
      <View style={rowS.right}>{right}</View>
    </Pressable>
  );
}
const rowS = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 14,
  },
  label: {
    flex: 1,
    fontSize: 15.5,
    fontFamily: 'Inter_400Regular',
  },
  right: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default function SettingsScreen() {
  const { logout } = useAuth();
  const { colors } = useTheme();
  const { showToast } = useToast();

  const [profile, setProfile] = useState({ name: '', email: '' });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [profilePictureUri, setProfilePictureUri] = useState(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const u = await fetchCurrentUser();
        setProfile({ name: u.name, email: u.email });
      } catch {
        const storedEmail = await getStoredEmail();
        setProfile((prev) => ({ ...prev, email: storedEmail || '' }));
      }
      const storedPw = await getStoredPassword();
      setPassword(storedPw || '');
    }
    async function loadSettings() {
      const enabled = await SecureStore.getItemAsync('notifications_enabled');
      setNotificationsEnabled(enabled !== 'false');
      const avatar = await SecureStore.getItemAsync('profile_picture_uri');
      if (avatar) setProfilePictureUri(avatar);
    }
    loadProfile();
    loadSettings();
  }, []);

  const handleToggleNotifications = async (val) => {
    setNotificationsEnabled(val);
    await SecureStore.setItemAsync('notifications_enabled', val ? 'true' : 'false');
    showToast(val ? 'Notifications enabled' : 'Notifications disabled', 'success');
  };

  const handlePickProfilePicture = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Denied', 'Grant gallery access to change your photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5,
      });
      if (!result.canceled && result.assets?.length > 0) {
        const localUri = `${FileSystem.documentDirectory}profile_picture.png`;
        await FileSystem.copyAsync({ from: result.assets[0].uri, to: localUri });
        await SecureStore.setItemAsync('profile_picture_uri', localUri);
        setProfilePictureUri(localUri);
        showToast('Profile picture updated!', 'success');
      }
    } catch {
      showToast('Could not update photo.', 'error');
    }
  };

  const initials = useMemo(() => {
    if (!profile.name) return '??';
    return profile.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  }, [profile.name]);

  const s = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Text style={s.title}>Settings</Text>

        {/* Profile card */}
        <View style={[s.card, { marginBottom: 28 }]}>
          <Pressable style={s.profileRow} onPress={handlePickProfilePicture}>
            <View style={s.avatarWrap}>
              <Avatar initials={initials} size={62} imageUri={profilePictureUri} />
            </View>
            <View style={s.profileInfo}>
              <Text style={s.profileName} numberOfLines={1}>{profile.name || 'User'}</Text>
              <Text style={s.profileEmail} numberOfLines={1}>{profile.email || ''}</Text>
            </View>
            <Ionicons name="chevron-down" size={18} color={colors.textTertiary} />
          </Pressable>
        </View>

        {/* Account group */}
        <View style={s.card}>
          <Row
            icon="person-outline"
            iconColor="#007AFF"
            label="Account"
            right={<ChevronRightIcon color={colors.textTertiary} />}
            colors={colors}
          />
          <Row
            icon="lock-closed-outline"
            iconColor="#34C759"
            label="Privacy"
            right={<ChevronRightIcon color={colors.textTertiary} />}
            colors={colors}
          />
          <Row
            icon="chatbubble-ellipses-outline"
            iconColor="#FF9500"
            label="Chats"
            right={<ChevronRightIcon color={colors.textTertiary} />}
            colors={colors}
          />
          <Row
            icon="notifications-outline"
            iconColor="#FF3B30"
            label="Notifications"
            right={
              <Switch
                value={notificationsEnabled}
                onValueChange={handleToggleNotifications}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={Platform.OS === 'ios' ? undefined : '#FFFFFF'}
              />
            }
            onPress={() => handleToggleNotifications(!notificationsEnabled)}
            colors={colors}
          />
          <Row
            icon="color-palette-outline"
            iconColor="#AF52DE"
            label="Appearance"
            right={<ChevronRightIcon color={colors.textTertiary} />}
            colors={colors}
          />
          <Row
            icon="help-circle-outline"
            iconColor="#5856D6"
            label="Help & Support"
            right={<ChevronRightIcon color={colors.textTertiary} />}
            divider={false}
            colors={colors}
          />
        </View>

        {/* Account details */}
        <View style={[s.card, { marginTop: 28 }]}>
          <Row
            icon="mail-outline"
            iconColor="#007AFF"
            label={profile.email || 'Email'}
            right={null}
            divider={true}
            colors={colors}
          />
          <Row
            icon="key-outline"
            iconColor="#FF9500"
            label={showPassword ? password : '••••••••••••'}
            right={
              <Pressable onPress={() => setShowPassword((p) => !p)} hitSlop={8}>
                <EyeIcon off={showPassword} color={colors.textSecondary} size={18} />
              </Pressable>
            }
            divider={false}
            colors={colors}
          />
        </View>

        {/* Security */}
        <View style={[s.card, { marginTop: 28 }]}>
          <Row
            icon="shield-checkmark-outline"
            iconColor="#34C759"
            label="End-to-end encrypted"
            right={<Text style={[s.tag, { color: colors.online }]}>Active</Text>}
            divider={false}
            colors={colors}
          />
        </View>

        {/* Log out */}
        <Pressable style={[s.card, s.logoutRow, { marginTop: 28, marginBottom: 32 }]} onPress={logout}>
          <Ionicons name="log-out-outline" size={20} color={colors.destructive} />
          <Text style={[s.logoutText, { color: colors.destructive }]}>Log Out</Text>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: 16,
      paddingTop: 12,
      backgroundColor: colors.background,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 28,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -0.5,
      marginBottom: 20,
      paddingLeft: 4,
    },
    card: {
      backgroundColor: colors.screen,
      borderRadius: 14,
      overflow: 'hidden',
    },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 14,
    },
    avatarWrap: {},
    profileInfo: {
      flex: 1,
      gap: 3,
    },
    profileName: {
      color: colors.textPrimary,
      fontSize: 17,
      fontFamily: 'Inter_600SemiBold',
    },
    profileEmail: {
      color: colors.textSecondary,
      fontSize: 13.5,
      fontFamily: 'Inter_400Regular',
    },
    tag: {
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
    },
    logoutRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      gap: 10,
    },
    logoutText: {
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
    },
  });
}
