import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import Avatar from '../components/Avatar';
import { ChevronLeftIcon, MoreVerticalIcon, PaperclipIcon, SendIcon, DoubleCheckIcon } from '../components/icons';
import { useTheme } from '../theme';

const MESSAGES = [
  { id: 'divider-1', type: 'divider', label: 'Today' },
  { id: '1', type: 'incoming', text: 'Hey! Did you get a chance to look at the file I sent?', time: '9:12 AM' },
  { id: '2', type: 'outgoing', text: 'Yes, just opened it. Looks great!', time: '9:14 AM', read: true },
  { id: '3', type: 'incoming', text: 'Sent you an encrypted photo', time: '9:15 AM' },
  { id: '4', type: 'outgoing', text: 'Perfect, thank you 🙏', time: '9:16 AM', read: true },
];

export default function ChatScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const contact = route?.params?.contact ?? { name: 'Jordan Reyes', initials: 'JR', status: 'online' };
  const [draft, setDraft] = useState('');

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <ChevronLeftIcon color={colors.textSecondary} />
        </Pressable>
        <Avatar initials={contact.initials} size={38} />
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{contact.name}</Text>
          <Text style={styles.headerStatus}>{contact.status === 'online' ? 'Online' : 'Offline'}</Text>
        </View>
        <Pressable hitSlop={8}>
          <MoreVerticalIcon color={colors.textSecondary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          data={MESSAGES}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          renderItem={({ item }) => {
            if (item.type === 'divider') {
              return (
                <View style={styles.dividerWrap}>
                  <Text style={styles.dividerText}>{item.label}</Text>
                </View>
              );
            }
            const isOutgoing = item.type === 'outgoing';
            return (
              <View style={[styles.bubbleWrap, isOutgoing && styles.bubbleWrapOutgoing]}>
                <View style={[styles.bubble, isOutgoing ? styles.bubbleOutgoing : styles.bubbleIncoming]}>
                  <Text style={[styles.bubbleText, isOutgoing && styles.bubbleTextOutgoing]}>{item.text}</Text>
                </View>
                <View style={[styles.meta, isOutgoing && styles.metaOutgoing]}>
                  <Text style={styles.metaTime}>{item.time}</Text>
                  {isOutgoing && item.read ? <DoubleCheckIcon color={colors.accent} /> : null}
                </View>
              </View>
            );
          }}
        />

        <Text style={styles.typing}>{contact.name.split(' ')[0]} is typing…</Text>

        <View style={styles.inputRow}>
          <Pressable style={styles.attachButton} hitSlop={8}>
            <PaperclipIcon color={colors.textSecondary} />
          </Pressable>
          <View style={styles.inputPill}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
              multiline
            />
          </View>
          <Pressable style={styles.sendButton} onPress={() => setDraft('')} hitSlop={8}>
            <SendIcon color={colors.onAccent} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    flex: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.surface,
    },
    headerInfo: {
      flex: 1,
    },
    headerName: {
      color: colors.textPrimary,
      fontSize: 15.5,
      fontFamily: 'Inter_600SemiBold',
    },
    headerStatus: {
      color: colors.online,
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
    },
    messageList: {
      gap: 14,
      padding: 16,
    },
    dividerWrap: {
      alignSelf: 'center',
    },
    dividerText: {
      color: colors.textTertiary,
      fontSize: 11,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 20,
      overflow: 'hidden',
    },
    bubbleWrap: {
      alignSelf: 'flex-start',
      maxWidth: '78%',
      gap: 4,
      marginBottom: 14,
    },
    bubbleWrapOutgoing: {
      alignSelf: 'flex-end',
      alignItems: 'flex-end',
    },
    bubble: {
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    bubbleIncoming: {
      backgroundColor: colors.surfaceAlt,
      borderRadius: 18,
      borderBottomLeftRadius: 4,
    },
    bubbleOutgoing: {
      backgroundColor: colors.accent,
      borderRadius: 18,
      borderBottomRightRadius: 4,
    },
    bubbleText: {
      color: colors.textPrimary,
      fontSize: 15,
      lineHeight: 21,
      fontFamily: 'Inter_400Regular',
    },
    bubbleTextOutgoing: {
      color: colors.onAccent,
      fontFamily: 'Inter_500Medium',
    },
    meta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingLeft: 4,
    },
    metaOutgoing: {
      paddingLeft: 0,
      paddingRight: 4,
    },
    metaTime: {
      color: colors.textTertiary,
      fontSize: 11,
    },
    typing: {
      color: colors.textTertiary,
      fontSize: 12.5,
      fontStyle: 'italic',
      paddingHorizontal: 20,
      paddingBottom: 6,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 20,
    },
    attachButton: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inputPill: {
      flex: 1,
      minHeight: 44,
      borderRadius: 22,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    input: {
      color: colors.textPrimary,
      fontSize: 14.5,
      fontFamily: 'Inter_400Regular',
      paddingVertical: Platform.OS === 'ios' ? 10 : 6,
      maxHeight: 100,
    },
    sendButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
