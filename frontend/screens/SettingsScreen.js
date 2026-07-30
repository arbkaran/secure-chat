import { useMemo, useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import Avatar from '../components/Avatar';
import { BellIcon, HelpIcon, ChevronRightIcon, ShieldIcon, LogOutIcon, EyeIcon } from '../components/icons';
import { useTheme } from '../theme';
import { useAuth } from '../context/AuthContext';
import { getStoredEmail, getStoredPassword } from '../api/authStorage';
import { fetchCurrentUser } from '../api/client';

export default function SettingsScreen() {
  const { logout } = useAuth();
  const { colors, spacing } = useTheme();
  const styles = useMemo(() => createStyles(colors, spacing), [colors, spacing]);

  const [profile, setProfile] = useState({ name: '', email: '' });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

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
  }, []);

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
          <Avatar initials={initials} size={84} />
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
            <Text style={styles.groupRowLabel}>Notifications</Text>
            <ChevronRightIcon color={colors.textTertiary} />
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
      paddingHorizontal: 20,
      paddingBottom: spacing.screen,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 26,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -0.5,
      marginBottom: 12,
    },
    profile: {
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      marginBottom: 24,
    },
    name: {
      color: colors.textPrimary,
      fontSize: 18,
      fontFamily: 'Inter_600SemiBold',
    },
    email: {
      color: colors.textSecondary,
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
    },
    group: {
      borderRadius: 14,
      backgroundColor: colors.surface,
      overflow: 'hidden',
      marginBottom: 20,
    },
    groupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    groupRowDivider: {
      borderBottomWidth: 1,
      borderBottomColor: colors.background,
    },
    groupRowLabel: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 15,
      fontFamily: 'Inter_400Regular',
    },
    section: {
      gap: 10,
      marginBottom: 8,
    },
    sectionLabel: {
      color: colors.textTertiary,
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      paddingLeft: 4,
    },
    securityCard: {
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      padding: 16,
      gap: 12,
    },
    securityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    securityIcon: {
      width: 32,
      height: 32,
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
      fontSize: 14.5,
      fontFamily: 'Inter_600SemiBold',
    },
    securitySubtitle: {
      color: colors.textSecondary,
      fontSize: 12.5,
      fontFamily: 'Inter_400Regular',
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
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
    },
    logout: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 50,
      borderRadius: 12,
      backgroundColor: colors.surface,
      marginTop: 16,
    },
    logoutText: {
      color: colors.destructive,
      fontSize: 14.5,
      fontFamily: 'Inter_600SemiBold',
    },
    card: {
      borderRadius: 14,
      backgroundColor: colors.surface,
      padding: 16,
      gap: 12,
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
    passwordHidden: {
      fontFamily: 'monospace',
      letterSpacing: 1.5,
    },
    eyeButton: {
      padding: 4,
    },
  });
}
