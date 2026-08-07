import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import TextField from '../components/TextField';
import Button from '../components/Button';
import EncryptedFooter from '../components/EncryptedFooter';
import { ShieldIcon } from '../components/icons';
import { useTheme } from '../theme';
import { forgotPassword } from '../api/client';

export default function ForgotPasswordScreen({ navigation }) {
  const { colors, spacing } = useTheme();
  const styles = useMemo(() => createStyles(colors, spacing), [colors, spacing]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function handleSendCode() {
    if (!email) {
      setError('Please enter your email address');
      return;
    }
    setError('');
    setMessage('');
    setLoading(true);
    try {
      await forgotPassword(email);
      // Navigate to ResetPassword and pass the email
      navigation.navigate('ResetPassword', { email });
    } catch (e) {
      setError(e?.response?.data?.detail ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenContainer style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.cardWrapper} onPress={Keyboard.dismiss}>
          <View style={styles.card}>
            <View style={styles.iconBadge}>
              <ShieldIcon size={32} color={colors.accent} />
            </View>

            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>Enter your email to receive a password reset OTP code.</Text>

            <TextField
              label="Email Address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {message ? <Text style={styles.successText}>{message}</Text> : null}

            <Button title={loading ? 'Sending code…' : 'Send Code'} onPress={handleSendCode} disabled={loading} />

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
            </View>

            <Pressable style={styles.loginRow} onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>Back to Log In</Text>
            </Pressable>
          </View>
        </Pressable>
      </KeyboardAvoidingView>

      <EncryptedFooter />
    </ScreenContainer>
  );
}

function createStyles(colors, spacing) {
  return StyleSheet.create({
    flex: { flex: 1 },
    container: {
      backgroundColor: colors.background,
    },
    cardWrapper: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    card: {
      backgroundColor: colors.surface,
      width: '100%',
      maxWidth: 400,
      padding: 32,
      borderRadius: 20,
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.1,
      shadowRadius: 24,
      elevation: 4,
      alignItems: 'center',
    },
    iconBadge: {
      width: 64,
      height: 64,
      borderRadius: 16,
      backgroundColor: colors.accent + '15',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: 6,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textTertiary,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 20,
    },
    errorText: {
      color: colors.danger || '#ef4444',
      fontSize: 13,
      fontWeight: '500',
      marginBottom: 16,
      textAlign: 'center',
    },
    successText: {
      color: '#22c55e',
      fontSize: 13,
      fontWeight: '500',
      marginBottom: 16,
      textAlign: 'center',
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      marginVertical: 20,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: colors.border,
    },
    loginRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    loginLink: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.accent,
    },
  });
}
