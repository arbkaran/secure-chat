import { useMemo, useState, useEffect } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView,
  Switch, Alert, Platform, Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ScreenContainer from '../components/ScreenContainer';
import Avatar from '../components/Avatar';
import { ChevronRightIcon, EyeIcon } from '../components/icons';
import { useTheme } from '../theme';
import { useAuth } from '../context/AuthContext';
import { getStoredEmail, getStoredPassword } from '../api/authStorage';
import { fetchCurrentUser, updateProfileName, clearAllMessages, deleteAccount } from '../api/client';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { useToast } from '../context/ToastContext';
import { getStoredPublicKey } from '../crypto/keys';
import { API_BASE_URL } from '../config/env';

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
  const { colors, themePreference, setThemePreference } = useTheme();
  const { showToast } = useToast();

  const [profile, setProfile] = useState({ name: '', email: '' });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [profilePictureUri, setProfilePictureUri] = useState(null);

  // Modal / overlay states
  const [activeModal, setActiveModal] = useState(null); // 'account' | 'privacy' | 'chats' | 'appearance' | 'support' | null
  const [editName, setEditName] = useState('');
  const [publicKey, setPublicKey] = useState('Loading key details...');
  const [loading, setLoading] = useState(false);

  const [deviceEncryptionId, setDeviceEncryptionId] = useState('');
  const [lanIpAddress, setLanIpAddress] = useState('Unknown');

  useEffect(() => {
    async function loadProfile() {
      try {
        const u = await fetchCurrentUser();
        setProfile({ name: u.name, email: u.email });
        setEditName(u.name);
      } catch {
        const storedEmail = await getStoredEmail();
        setProfile((prev) => ({ ...prev, email: storedEmail || '' }));
      }
      const storedPw = await getStoredPassword();
      setPassword(storedPw || '');
    }
    async function loadSettings() {
      try {
        const enabled = await SecureStore.getItemAsync('notifications_enabled');
        setNotificationsEnabled(enabled !== 'false');
        const avatar = await SecureStore.getItemAsync('profile_picture_uri');
        if (avatar) setProfilePictureUri(avatar);
      } catch (e) {}
    }
    async function loadEncryptionDetails() {
      try {
        let encId = await SecureStore.getItemAsync('device_encryption_id');
        if (!encId) {
          const chars = '0123456789ABCDEF';
          let result = '';
          for (let i = 0; i < 16; i++) {
            if (i > 0 && i % 4 === 0) result += '-';
            result += chars[Math.floor(Math.random() * 16)];
          }
          encId = result;
          await SecureStore.setItemAsync('device_encryption_id', encId);
        }
        setDeviceEncryptionId(encId);

        // Parse LAN IP
        const match = API_BASE_URL.match(/\/\/([^:/]+)/);
        setLanIpAddress(match ? match[1] : 'Unknown');
      } catch (e) {
        setLanIpAddress('Unknown');
      }
    }
    loadProfile();
    loadSettings();
    loadEncryptionDetails();
  }, []);

  // Fetch public key when privacy modal opens
  useEffect(() => {
    if (activeModal === 'privacy') {
      getStoredPublicKey().then((key) => {
        setPublicKey(key || 'No cryptographic identity key found.');
      });
    }
  }, [activeModal]);

  const handleToggleNotifications = async (val) => {
    setNotificationsEnabled(val);
    try {
      await SecureStore.setItemAsync('notifications_enabled', val ? 'true' : 'false');
      showToast(val ? 'Notifications enabled' : 'Notifications disabled', 'success');
    } catch (e) {}
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

  const handleSaveName = async () => {
    if (!editName.trim()) {
      showToast('Name cannot be empty', 'error');
      return;
    }
    setLoading(true);
    try {
      await updateProfileName(editName);
      setProfile((prev) => ({ ...prev, name: editName }));
      showToast('Profile name updated!', 'success');
      setActiveModal(null);
    } catch {
      showToast('Could not update profile name.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      'Delete Account',
      'Are you absolutely sure you want to delete your account? This will permanently erase your profile, cryptographic keys, messages, and files. This action is irreversible.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: async () => {
            setLoading(true);
            try {
              await deleteAccount();
              setActiveModal(null);
              showToast('Account deleted successfully', 'success');
              await logout();
            } catch (err) {
              showToast('Could not delete account. Try again.', 'error');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleClearChats = async () => {
    setLoading(true);
    try {
      await clearAllMessages();
      showToast('Message history cleared successfully.', 'success');
      setActiveModal(null);
    } catch {
      showToast('Could not clear message history.', 'error');
    } finally {
      setLoading(false);
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
            onPress={() => {
              setEditName(profile.name);
              setActiveModal('account');
            }}
            colors={colors}
          />
          <Row
            icon="lock-closed-outline"
            iconColor="#34C759"
            label="Privacy"
            right={<ChevronRightIcon color={colors.textTertiary} />}
            onPress={() => setActiveModal('privacy')}
            colors={colors}
          />
          <Row
            icon="chatbubble-ellipses-outline"
            iconColor="#FF9500"
            label="Chats"
            right={<ChevronRightIcon color={colors.textTertiary} />}
            onPress={() => setActiveModal('chats')}
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
            onPress={() => setActiveModal('appearance')}
            colors={colors}
          />
          <Row
            icon="help-circle-outline"
            iconColor="#5856D6"
            label="Help & Support"
            right={<ChevronRightIcon color={colors.textTertiary} />}
            onPress={() => setActiveModal('support')}
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
            divider={true}
            colors={colors}
          />
          <Row
            icon="fingerprint-outline"
            iconColor="#FF3B30"
            label="Encryption Number"
            right={<Text style={{ color: colors.textSecondary, fontSize: 14, fontFamily: 'Inter_500Medium' }}>{deviceEncryptionId}</Text>}
            divider={true}
            colors={colors}
          />
          <Row
            icon="wifi-outline"
            iconColor="#007AFF"
            label="Connected LAN"
            right={<Text style={{ color: colors.textSecondary, fontSize: 14, fontFamily: 'Inter_500Medium' }}>{lanIpAddress}</Text>}
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

      {/* --- MODALS --- */}

      {/* 1. Account Settings Modal */}
      <Modal
        visible={activeModal === 'account'}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Account Profile</Text>
            <Text style={s.modalLabel}>Display Name</Text>
            <TextInput
              style={s.textInput}
              value={editName}
              onChangeText={setEditName}
              placeholder="Your Name"
              placeholderTextColor={colors.textTertiary}
            />
            {loading ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} />
            ) : (
              <View style={{ width: '100%' }}>
                <View style={s.modalButtons}>
                  <Pressable style={[s.modalBtn, { backgroundColor: colors.surfaceAlt }]} onPress={() => setActiveModal(null)}>
                    <Text style={[s.modalBtnText, { color: colors.textPrimary }]}>Cancel</Text>
                  </Pressable>
                  <Pressable style={[s.modalBtn, { backgroundColor: colors.accent }]} onPress={handleSaveName}>
                    <Text style={[s.modalBtnText, { color: '#fff' }]}>Save</Text>
                  </Pressable>
                </View>
                <View style={{ height: 16 }} />
                <Pressable 
                  style={[s.modalBtn, { backgroundColor: colors.destructive + '15', borderColor: colors.destructive, borderWidth: StyleSheet.hairlineWidth, width: '100%', alignSelf: 'stretch' }]} 
                  onPress={handleDeleteAccount}
                >
                  <Text style={[s.modalBtnText, { color: colors.destructive, fontWeight: '600' }]}>Delete Account</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* 2. Privacy Settings Modal */}
      <Modal
        visible={activeModal === 'privacy'}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>E2E Privacy Keys</Text>
            <Text style={s.modalBodyText}>
              Your messages are fully end-to-end encrypted. Below is your active RSA public identity key registration.
            </Text>
            <ScrollView style={s.keyContainer} contentContainerStyle={{ padding: 10 }}>
              <Text style={s.keyText} selectable={true}>{publicKey}</Text>
            </ScrollView>
            <Pressable style={[s.modalBtn, { backgroundColor: colors.accent, alignSelf: 'stretch', marginTop: 16 }]} onPress={() => setActiveModal(null)}>
              <Text style={[s.modalBtnText, { color: '#fff' }]}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 3. Chats purger Modal */}
      <Modal
        visible={activeModal === 'chats'}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Clear History</Text>
            <Text style={s.modalBodyText}>
              Are you sure you want to permanently erase all message conversations? This action is irreversible.
            </Text>
            {loading ? (
              <ActivityIndicator color={colors.destructive} style={{ marginVertical: 12 }} />
            ) : (
              <View style={s.modalButtons}>
                <Pressable style={[s.modalBtn, { backgroundColor: colors.surfaceAlt }]} onPress={() => setActiveModal(null)}>
                  <Text style={[s.modalBtnText, { color: colors.textPrimary }]}>Cancel</Text>
                </Pressable>
                <Pressable style={[s.modalBtn, { backgroundColor: colors.destructive }]} onPress={handleClearChats}>
                  <Text style={[s.modalBtnText, { color: '#fff' }]}>Erase All</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* 4. Appearance Selection Modal */}
      <Modal
        visible={activeModal === 'appearance'}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Select Theme</Text>
            
            <Pressable
              style={s.themeOptionRow}
              onPress={() => setThemePreference('light')}
            >
              <Text style={[s.themeOptionText, { color: colors.textPrimary }]}>Light Mode</Text>
              {themePreference === 'light' && <Ionicons name="checkmark-circle" size={22} color={colors.accent} />}
            </Pressable>

            <Pressable
              style={s.themeOptionRow}
              onPress={() => setThemePreference('dark')}
            >
              <Text style={[s.themeOptionText, { color: colors.textPrimary }]}>Dark Mode</Text>
              {themePreference === 'dark' && <Ionicons name="checkmark-circle" size={22} color={colors.accent} />}
            </Pressable>

            <Pressable
              style={s.themeOptionRow}
              onPress={() => setThemePreference('system')}
            >
              <Text style={[s.themeOptionText, { color: colors.textPrimary }]}>System Default</Text>
              {themePreference === 'system' && <Ionicons name="checkmark-circle" size={22} color={colors.accent} />}
            </Pressable>

            <Pressable style={[s.modalBtn, { backgroundColor: colors.accent, alignSelf: 'stretch', marginTop: 20 }]} onPress={() => setActiveModal(null)}>
              <Text style={[s.modalBtnText, { color: '#fff' }]}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* 5. Support / Help Modal */}
      <Modal
        visible={activeModal === 'support'}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Help & Support</Text>
            <View style={{ gap: 12, marginVertical: 10, alignSelf: 'stretch' }}>
              <View style={s.supportDetailRow}>
                <Text style={[s.supportLabel, { color: colors.textSecondary }]}>App Version</Text>
                <Text style={[s.supportVal, { color: colors.textPrimary }]}>1.0.0 (Release)</Text>
              </View>
              <View style={s.supportDetailRow}>
                <Text style={[s.supportLabel, { color: colors.textSecondary }]}>Encryption</Text>
                <Text style={[s.supportVal, { color: colors.textPrimary }]}>RSAES-OAEP / AES-GCM</Text>
              </View>
              <View style={s.supportDetailRow}>
                <Text style={[s.supportLabel, { color: colors.textSecondary }]}>Core Engine</Text>
                <Text style={[s.supportVal, { color: colors.textPrimary }]}>React Native + FastAPI</Text>
              </View>
              <View style={s.supportDetailRow}>
                <Text style={[s.supportLabel, { color: colors.textSecondary }]}>Contact Support</Text>
                <Text style={[s.supportVal, { color: colors.accent }]}>support@securechat.io</Text>
              </View>
            </View>
            <Pressable style={[s.modalBtn, { backgroundColor: colors.accent, alignSelf: 'stretch', marginTop: 16 }]} onPress={() => setActiveModal(null)}>
              <Text style={[s.modalBtnText, { color: '#fff' }]}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
    // Modal Styles
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    modalContent: {
      backgroundColor: colors.screen,
      borderRadius: 18,
      padding: 20,
      width: '100%',
      maxWidth: 400,
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    modalTitle: {
      fontSize: 19,
      fontFamily: 'Inter_700Bold',
      color: colors.textPrimary,
      marginBottom: 14,
    },
    modalLabel: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
      color: colors.textSecondary,
      alignSelf: 'flex-start',
      marginBottom: 6,
    },
    modalBodyText: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 16,
      lineHeight: 20,
    },
    textInput: {
      height: 44,
      width: '100%',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      color: colors.textPrimary,
      backgroundColor: colors.surfaceAlt,
      fontSize: 15,
      fontFamily: 'Inter_400Regular',
      marginBottom: 16,
    },
    modalButtons: {
      flexDirection: 'row',
      gap: 12,
      width: '100%',
      justifyContent: 'flex-end',
    },
    modalBtn: {
      paddingVertical: 11,
      paddingHorizontal: 18,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 80,
    },
    modalBtnText: {
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
    },
    keyContainer: {
      maxHeight: 180,
      width: '100%',
      backgroundColor: colors.surfaceAlt,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    keyText: {
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      fontSize: 11,
      color: colors.textSecondary,
    },
    themeOptionRow: {
      flexDirection: 'row',
      width: '100%',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    themeOptionText: {
      fontSize: 16,
      fontFamily: 'Inter_400Regular',
    },
    supportDetailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      width: '100%',
      paddingVertical: 4,
    },
    supportLabel: {
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
    },
    supportVal: {
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
    },
  });
}

