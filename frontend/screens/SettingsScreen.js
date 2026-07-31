import { useMemo, useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Switch, Alert, Platform } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import Avatar from '../components/Avatar';
import { BellIcon, HelpIcon, ChevronRightIcon, ShieldIcon, LogOutIcon, EyeIcon } from '../components/icons';
import { useTheme } from '../theme';
import { useAuth } from '../context/AuthContext';
import { getStoredEmail, getStoredPassword } from '../api/authStorage';
import { fetchCurrentUser } from '../api/client';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { useToast } from '../context/ToastContext';

export default function SettingsScreen() {
  const { logout } = useAuth();
  const { colors, spacing } = useTheme();
  const styles = useMemo(() => createStyles(colors, spacing), [colors, spacing]);
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
      } catch (e) {
        const storedEmail = await getStoredEmail();
        setProfile((prev) => ({ ...prev, email: storedEmail || '' }));
      }

      const storedPw = await getStoredPassword();
      setPassword(storedPw || '');
    }
    loadProfile();

    async function loadLocalSettings() {
      const enabled = await SecureStore.getItemAsync('notifications_enabled');
      setNotificationsEnabled(enabled !== 'false');

      const avatar = await SecureStore.getItemAsync('profile_picture_uri');
      if (avatar) setProfilePictureUri(avatar);
    }
    loadLocalSettings();
  }, []);

  const handleToggleNotifications = async (val) => {
    setNotificationsEnabled(val);
    await SecureStore.setItemAsync('notifications_enabled', val ? 'true' : 'false');
    showToast(val ? 'Notifications enabled!' : 'Notifications disabled.', 'success');
  };

  const handlePickProfilePicture = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Denied', 'Please grant gallery permissions to select an avatar.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const sourceUri = result.assets[0].uri;
        const localUri = `${FileSystem.documentDirectory}profile_picture.png`;
        
        await FileSystem.copyAsync({
          from: sourceUri,
          to: localUri,
        });

        await SecureStore.setItemAsync('profile_picture_uri', localUri);
        setProfilePictureUri(localUri);
        showToast('Profile picture updated!', 'success');
      }
    } catch (e) {
      console.error('Failed to pick profile picture', e);
      showToast('Could not pick profile picture.', 'error');
    }
  };

  const initials = useMemo(() => {
    if (!profile.name) return '??';
    return profile.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }, [profile.name]);

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.profile}>
          <Pressable style={styles.profileAvatarContainer} onPress={handlePickProfilePicture}>
            <Avatar initials={initials} size={84} imageUri={profilePictureUri} />
            <View style={styles.avatarEditOverlay}>
              <Text style={styles.avatarEditText}>EDIT</Text>
            </View>
          </Pressable>
          <Text style={styles.name}>{profile.name || 'User'}</Text>
          <Text style={styles.email}>{profile.email || 'No email'}</Text>
        </View>

        <View style={[styles.section, { marginBottom: 20 }]}>
          <Text style={styles.sectionLabel}>Registered Account Details</Text>
          <View style={styles.card}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Email Address</Text>
              <Text style={styles.detailValue}>{profile.email || 'N/A'}</Text>
            </View>
            <View style={styles.cardDivider} />
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Password</Text>
              <View style={styles.passwordContainer}>
                <Text style={[styles.detailValue, !showPassword && styles.passwordHidden]}>
                  {showPassword ? password : '••••••••••••'}
                </Text>
                <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                  <EyeIcon off={showPassword} color={colors.textSecondary} size={20} />
                </Pressable>
              </View>
            </View>
          </View>
        </View>


        <View style={styles.group}>
          <View style={[styles.groupRow, styles.groupRowDivider]}>
            <BellIcon color={colors.textSecondary} />
            <Text style={styles.groupRowLabel}>In-App Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={Platform.OS === 'ios' ? undefined : '#FFFFFF'}
            />
          </View>
          <View style={styles.groupRow}>
            <HelpIcon color={colors.textSecondary} />
            <Text style={styles.groupRowLabel}>Help &amp; Support</Text>
            <ChevronRightIcon color={colors.textTertiary} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Encryption &amp; Security</Text>
          <View style={styles.securityCard}>
            <View style={styles.securityRow}>
              <View style={styles.securityIcon}>
                <ShieldIcon size={16} color={colors.accent} />
              </View>
              <View style={styles.securityText}>
                <Text style={styles.securityTitle}>End-to-end encrypted</Text>
                <Text style={styles.securitySubtitle}>Only you and your contact can read messages</Text>
              </View>
            </View>
            <View style={styles.securityDivider} />
            <View style={styles.fingerprintRow}>
              <View>
                <Text style={styles.fingerprintLabel}>Your key fingerprint</Text>
                <Text style={styles.fingerprintValue}>4A2F · 9C1E · 88B0 · D3F7</Text>
              </View>
              <Text style={styles.verifyLink}>Verify</Text>
            </View>
          </View>
        </View>

        <Pressable style={styles.logout} onPress={logout}>
          <LogOutIcon color={colors.destructive} />
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

function createStyles(colors, spacing) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: 24,
      paddingTop: 16,
      paddingBottom: spacing.screen,
      backgroundColor: colors.background,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 24,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -0.5,
      marginBottom: 16,
    },
    profile: {
      alignItems: 'center',
      gap: 10,
      paddingVertical: 20,
      backgroundColor: colors.surface,
      borderRadius: 20,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.03,
      shadowRadius: 10,
      elevation: 1,
    },
    name: {
      color: colors.textPrimary,
      fontSize: 18,
      fontFamily: 'Inter_600SemiBold',
    },
    email: {
      color: colors.textSecondary,
      fontSize: 14.5,
      fontFamily: 'Inter_400Regular',
    },
    group: {
      borderRadius: 16,
      backgroundColor: colors.surface,
      overflow: 'hidden',
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.03,
      shadowRadius: 10,
      elevation: 1,
    },
    groupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 18,
      paddingVertical: 15,
    },
    groupRowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    groupRowLabel: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 15,
      fontFamily: 'Inter_400Regular',
    },
    section: {
      gap: 10,
      marginBottom: 16,
    },
    sectionLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      paddingLeft: 4,
    },
    securityCard: {
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      padding: 18,
      gap: 14,
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.03,
      shadowRadius: 10,
      elevation: 1,
    },
    securityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    securityIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    securityText: {
      flex: 1,
    },
    securityTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
    },
    securitySubtitle: {
      color: colors.textSecondary,
      fontSize: 12.5,
      fontFamily: 'Inter_400Regular',
      lineHeight: 17,
    },
    securityDivider: {
      height: 1,
      backgroundColor: colors.border,
    },
    fingerprintRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    fingerprintLabel: {
      color: colors.textSecondary,
      fontSize: 12.5,
      fontFamily: 'Inter_400Regular',
    },
    fingerprintValue: {
      color: colors.textPrimary,
      fontSize: 13,
      fontFamily: 'monospace',
      letterSpacing: 0.5,
    },
    verifyLink: {
      color: colors.accent,
      fontSize: 13.5,
      fontFamily: 'Inter_600SemiBold',
    },
    logout: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 48,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 8,
      marginBottom: 20,
    },
    logoutText: {
      color: colors.destructive,
      fontSize: 14.5,
      fontFamily: 'Inter_600SemiBold',
    },
    card: {
      borderRadius: 16,
      backgroundColor: colors.surface,
      padding: 18,
      gap: 14,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.03,
      shadowRadius: 10,
      elevation: 1,
    },
    cardDivider: {
      height: 1,
      backgroundColor: colors.border,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    detailLabel: {
      color: colors.textSecondary,
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
    },
    detailValue: {
      color: colors.textPrimary,
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
    },
    passwordContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    profileAvatarContainer: {
      position: 'relative',
    },
    avatarEditOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'rgba(0,0,0,0.4)',
      paddingVertical: 3,
      borderBottomLeftRadius: 25,
      borderBottomRightRadius: 25,
      alignItems: 'center',
    },
    avatarEditText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontFamily: 'Inter_700Bold',
    },
    passwordHidden: {
      fontFamily: 'monospace',
      letterSpacing: 1.5,
    },
    eyeButton: {
      padding: 4,
    },
  });
}
