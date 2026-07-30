import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import TextField from '../components/TextField';
import Button from '../components/Button';
import EncryptedFooter from '../components/EncryptedFooter';
import { ShieldIcon, EyeIcon } from '../components/icons';
import { useTheme } from '../theme';
import { useAuth } from '../context/AuthContext';
import { login as apiLogin, uploadPublicKey } from '../api/client';
import { ensureKeypair } from '../crypto/keys';
import { connectSocket } from '../api/socket';
import { setStoredCredentials } from '../api/authStorage';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const { colors, spacing } = useTheme();
  const styles = useMemo(() => createStyles(colors, spacing), [colors, spacing]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin() {
    setError('');
    setLoading(true);
    try {
      const { user_id } = await apiLogin({ email, password });
      await setStoredCredentials(email, password);
      const publicKey = await ensureKeypair();
      await uploadPublicKey(publicKey);
      await connectSocket();
      login(user_id);
    } catch (e) {
      setError(e?.response?.data?.detail ?? 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View style={styles.iconBadge}>
            <ShieldIcon size={26} color={colors.accent} />
          </View>

          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Log in to continue your encrypted conversations.</Text>

          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
          />

          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            secureTextEntry={!showPassword}
            rightIcon={<EyeIcon off={showPassword} color={colors.textTertiary} />}
            onRightIconPress={() => setShowPassword((v) => !v)}
          />

          <Pressable style={styles.forgotRow} onPress={() => {}}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button title={loading ? 'Logging in…' : 'Log In'} onPress={handleLogin} disabled={loading} />

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <Pressable style={styles.registerRow} onPress={() => navigation.navigate('Register')}>
            <Text style={styles.registerPrompt}>Don't have an account?</Text>
            <Text style={styles.registerLink}>Register</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <EncryptedFooter />
    </ScreenContainer>
  );
}

function createStyles(colors, spacing) {
  return StyleSheet.create({
    flex: { flex: 1 },
    content: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: spacing.screen,
    },
    iconBadge: {
      width: 56,
      height: 56,
      borderRadius: 16,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.section,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 28,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -0.5,
      marginBottom: 6,
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 15,
      fontFamily: 'Inter_400Regular',
      marginBottom: spacing.section + 8,
    },
    forgotRow: {
      alignSelf: 'flex-end',
      marginBottom: 28,
    },
    forgotText: {
      color: colors.accent,
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
    },
    errorText: {
      color: colors.destructive,
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      marginBottom: 12,
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: spacing.section,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    dividerText: {
      color: colors.textTertiary,
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
    },
    registerRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
    },
    registerPrompt: {
      color: colors.textSecondary,
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
    },
    registerLink: {
      color: colors.accent,
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
    },
  });
}
