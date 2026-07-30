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
      setError(e?.response?.data?.detail ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenContainer>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Your keys are generated on this device and never leave it.</Text>

          <TextField label="Full name" value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" />
          <TextField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
          <TextField label="Password" value={password} onChangeText={setPassword} placeholder="Create a password" secureTextEntry style={{ marginBottom: spacing.tight }} />

          <View style={styles.strengthRow}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.strengthBar, i < strength && styles.strengthBarFilled]} />
            ))}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button title={loading ? 'Creating account…' : 'Create Account'} onPress={handleRegister} disabled={loading} />

          <Pressable style={styles.loginRow} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginPrompt}>Already have an account?</Text>
            <Text style={styles.loginLink}>Log in</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function createStyles(colors, spacing) {
  return StyleSheet.create({
    flex: { flex: 1 },
    content: {
      flexGrow: 1,
      paddingHorizontal: spacing.screen,
      paddingTop: 52,
      paddingBottom: spacing.screen,
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
    strengthRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: spacing.section,
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
    },
    loginRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
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
