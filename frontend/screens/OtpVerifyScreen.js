import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import Button from '../components/Button';
import { MailIcon } from '../components/icons';
import { useTheme } from '../theme';
import { verifyOtp as apiVerifyOtp } from '../api/client';

const CODE_LENGTH = 6;

export default function OtpVerifyScreen({ route, navigation }) {
  const { colors, spacing } = useTheme();
  const styles = useMemo(() => createStyles(colors, spacing), [colors, spacing]);
  const contact = route?.params?.contact ?? '+1 (415) 555-0148';
  const email = route?.params?.email ?? contact;
  const [code, setCode] = useState('');
  const [seconds, setSeconds] = useState(47);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  async function handleVerify(otpCode = code) {
    if (otpCode.length !== CODE_LENGTH) return;
    setError('');
    setLoading(true);
    try {
      await apiVerifyOtp({ email, code: otpCode });
      navigation.navigate('Login');
    } catch (e) {
      setError(e?.response?.data?.detail ?? 'Invalid or expired code');
    } finally {
      setLoading(false);
    }
  }

  const handleCodeChange = (text) => {
    const cleaned = text.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH);
    setCode(cleaned);
    if (cleaned.length === CODE_LENGTH) {
      Keyboard.dismiss();
      handleVerify(cleaned);
    }
  };

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [seconds]);

  const isComplete = code.length === CODE_LENGTH;
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.content} onPress={Keyboard.dismiss}>
          <View style={styles.iconBadge}>
            <MailIcon size={24} color={colors.accent} />
          </View>

          <Text style={styles.title}>Verify it's you</Text>
          <Text style={styles.subtitle}>
            Enter the 6-digit code sent to{'\n'}
            <Text style={styles.contact}>{contact}</Text>
          </Text>

          <Pressable style={styles.boxRow} onPress={() => inputRef.current?.focus()}>
            {Array.from({ length: CODE_LENGTH }).map((_, i) => {
              const filled = i < code.length;
              const active = i === code.length;
              return (
                <View key={i} style={[styles.box, (filled || active) && styles.boxActive]}>
                  <Text style={styles.boxText}>{code[i] ?? ''}</Text>
                  {active ? <View style={styles.cursor} /> : null}
                </View>
              );
            })}
          </Pressable>

          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={handleCodeChange}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            autoFocus
            style={styles.hiddenInput}
          />

          <Text style={styles.resendTimer}>
            {seconds > 0 ? (
              <>Resend code in <Text style={styles.resendTimerValue}>{mm}:{ss}</Text></>
            ) : (
              'You can resend the code now'
            )}
          </Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Button
            title={loading ? 'Verifying…' : 'Verify'}
            disabled={!isComplete || loading}
            onPress={() => handleVerify(code)}
          />

          <Pressable disabled={seconds > 0} onPress={() => setSeconds(60)}>
            <Text style={[styles.resendLink, seconds > 0 && styles.resendLinkDisabled]}>Resend code</Text>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
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
      fontSize: 26,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -0.5,
      marginBottom: 6,
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 15,
      fontFamily: 'Inter_400Regular',
      lineHeight: 21,
      marginBottom: 36,
    },
    contact: {
      color: colors.textPrimary,
      fontFamily: 'Inter_500Medium',
    },
    boxRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 28,
    },
    box: {
      flex: 1,
      height: 60,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxActive: {
      borderColor: colors.accent,
    },
    boxText: {
      color: colors.textPrimary,
      fontSize: 22,
      fontFamily: 'Inter_700Bold',
    },
    cursor: {
      position: 'absolute',
      width: 2,
      height: 24,
      backgroundColor: colors.accent,
    },
    hiddenInput: {
      position: 'absolute',
      opacity: 0,
      height: 1,
      width: 1,
    },
    resendTimer: {
      color: colors.textTertiary,
      fontSize: 13,
      marginBottom: 32,
    },
    resendTimerValue: {
      color: colors.textSecondary,
      fontFamily: 'Inter_600SemiBold',
    },
    resendLink: {
      textAlign: 'center',
      color: colors.accent,
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
    },
    resendLinkDisabled: {
      color: colors.textTertiary,
    },
    errorText: {
      color: colors.destructive,
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
      textAlign: 'center',
      marginBottom: 12,
    },
  });
}
