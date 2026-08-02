import { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import TextField from '../components/TextField';
import Button from '../components/Button';
import { useTheme } from '../theme';
import { register as apiRegister } from '../api/client';
import { setStoredCredentials } from '../api/authStorage';

function passwordStrength(password) {
  if (password.length >= 10) return 3;
  if (password.length >= 6) return 2;
  if (password.length > 0) return 1;
  return 0;
}

export default function RegisterScreen({ navigation }) {
  const { colors, spacing } = useTheme();
  const styles = useMemo(() => createStyles(colors, spacing), [colors, spacing]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const strength = passwordStrength(password);

  async function handleRegister() {
    setError('');
    setLoading(true);
    try {
      await apiRegister({ name, email, password });
      await setStoredCredentials(email, password);
      navigation.navigate('OtpVerify', { contact: email, email });
    } catch (e) {
      setError(e?.response?.data?.detail ?? (e?.code === 'ECONNABORTED' ? 'Server timed out — is the backend running?' : 'Registration failed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenContainer style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.cardWrapper}>
            <View style={styles.card}>
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Keys are generated locally and never leave this device.</Text>

              <TextField label="Full name" value={name} onChangeText={setName} placeholder="John Doe" autoCapitalize="words" />
              <TextField label="Email Address" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
              <TextField label="Password" value={password} onChangeText={setPassword} placeholder="Create a secure password" secureTextEntry style={{ marginBottom: 8 }} />

              <View style={styles.strengthRow}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={[styles.strengthBar, i < strength && styles.strengthBarFilled]} />
                ))}
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Button title={loading ? 'Creating account…' : 'Register'} onPress={handleRegister} disabled={loading} />

              <Pressable style={styles.loginRow} onPress={() => navigation.navigate('Login')}>
                <Text style={styles.loginPrompt}>Already have an account?</Text>
                <Text style={styles.loginLink}>Log in</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function createStyles(colors, spacing) {
  return StyleSheet.create({
    flex: { flex: 1 },
    container: {
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingVertical: 40,
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
      shadowOpacity: 0.05,
      shadowRadius: 16,
      elevation: 4,
      alignItems: 'stretch',
    },
    title: {
      color: colors.textPrimary,
      fontSize: 26,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -0.5,
      textAlign: 'center',
      marginBottom: 6,
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 14.5,
      fontFamily: 'Inter_400Regular',
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 20,
    },
    strengthRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 24,
      marginTop: 2,
    },
    strengthBar: {
      flex: 1,
      height: 3,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    strengthBarFilled: {
      backgroundColor: colors.accent,
    },
    errorText: {
      color: colors.destructive,
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      marginBottom: 12,
      textAlign: 'center',
    },
    loginRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
      marginTop: 24,
    },
    loginPrompt: {
      color: colors.textSecondary,
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
    },
    loginLink: {
      color: colors.accent,
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
    },
  });
}
