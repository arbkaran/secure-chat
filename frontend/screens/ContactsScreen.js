import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import Avatar from '../components/Avatar';
import { SearchIcon, PlusIcon } from '../components/icons';
import { useTheme } from '../theme';
import { connectSocket } from '../api/socket';
import useSocketListener from '../hooks/useSocketListener';
import { fetchAllUsers, searchUserByEmail } from '../api/client';

export default function ContactsScreen({ navigation }) {
  const { colors, spacing } = useTheme();
  const styles = useMemo(() => createStyles(colors, spacing), [colors, spacing]);
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState([]);
  const [liveStatus, setLiveStatus] = useState({});
  const [showAddContact, setShowAddContact] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [addError, setAddError] = useState('');

  useEffect(() => {
    connectSocket().catch(() => {});
    
    async function loadContacts() {
      try {
        const users = await fetchAllUsers();
        const formatted = users.map((u) => ({
          id: String(u.id),
          name: u.name,
          initials: u.name
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2),
          status: 'offline',
          lastMessage: 'Start a new conversation',
          time: '',
          unread: 0,
          read: true,
        }));
        setContacts(formatted);
      } catch (e) {
        console.error('Failed to load contacts', e);
      }
    }
    
    loadContacts();
  }, []);

  useSocketListener({
    onStatusUpdate: ({ user_id, status }) => {
      setLiveStatus((prev) => ({ ...prev, [user_id]: status }));
    },
  });

  const contactsWithLiveStatus = useMemo(
    () => contacts.map((c) => ({ ...c, status: liveStatus[c.id] ?? c.status })),
    [contacts, liveStatus],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return contactsWithLiveStatus;
    const q = query.trim().toLowerCase();
    return contactsWithLiveStatus.filter((c) => c.name.toLowerCase().includes(q));
  }, [query, contactsWithLiveStatus]);

  async function handleAddContact() {
    const trimmedEmail = emailInput.trim().toLowerCase();
    if (!trimmedEmail) return;
    try {
      const user = await searchUserByEmail(trimmedEmail);
      if (contacts.some((c) => c.id === String(user.id))) {
        setAddError('Contact already in list');
        return;
      }
      const newContact = {
        id: String(user.id),
        name: user.name,
        initials: user.name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2),
        status: 'offline',
        lastMessage: 'Start a new conversation',
        time: '',
        unread: 0,
        read: true,
      };
      setContacts((prev) => [newContact, ...prev]);
      setShowAddContact(false);
      setEmailInput('');
      setAddError('');
      navigation.navigate('Chat', { contact: newContact });
    } catch (e) {
      setAddError(e?.response?.data?.detail ?? 'User not found');
    }
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <Pressable style={styles.headerButton} onPress={() => setShowAddContact(!showAddContact)}>
          <PlusIcon color={colors.accent} />
        </Pressable>
      </View>

      {showAddContact && (
        <View style={styles.addContactCard}>
          <Text style={styles.addContactTitle}>Add Contact by Email</Text>
          <TextInput
            value={emailInput}
            onChangeText={(t) => { setEmailInput(t); setAddError(''); }}
            placeholder="Enter user's email"
            placeholderTextColor={colors.textTertiary}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.addContactInput}
          />
          {addError ? <Text style={styles.addErrorText}>{addError}</Text> : null}
          <View style={styles.addContactButtons}>
            <Pressable style={[styles.addButton, styles.cancelButton]} onPress={() => { setShowAddContact(false); setEmailInput(''); setAddError(''); }}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.addButton} onPress={handleAddContact}>
              <Text style={styles.addButtonText}>Search &amp; Add</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <SearchIcon color={colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search contacts"
            placeholderTextColor={colors.textTertiary}
            style={styles.searchInput}
          />
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('Chat', { contact: item })}
          >
            <Avatar initials={item.initials} status={item.status} />
            <View style={styles.rowBody}>
              <View style={styles.rowTop}>
                <Text style={[styles.name, !item.read && styles.nameUnread]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.time, item.unread > 0 && styles.timeUnread]}>{item.time}</Text>
              </View>
              <View style={styles.rowBottom}>
                <Text
                  style={[styles.preview, !item.read && styles.previewUnread]}
                  numberOfLines={1}
                >
                  {item.lastMessage}
                </Text>
                {item.unread > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.unread}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Pressable>
        )}
      />
    </ScreenContainer>
  );
}

function createStyles(colors, spacing) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 12,
    },
    headerTitle: {
      color: colors.textPrimary,
      fontSize: 26,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -0.5,
    },
    headerButton: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addContactCard: {
      backgroundColor: colors.surface,
      marginHorizontal: 20,
      marginBottom: 16,
      borderRadius: 14,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    addContactTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
      marginBottom: 10,
    },
    addContactInput: {
      height: 40,
      borderRadius: 10,
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderWidth: 1,
      paddingHorizontal: 12,
      color: colors.textPrimary,
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      marginBottom: 8,
    },
    addErrorText: {
      color: colors.destructive,
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      marginBottom: 8,
    },
    addContactButtons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
    },
    addButton: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 8,
      backgroundColor: colors.accent,
    },
    cancelButton: {
      backgroundColor: 'transparent',
    },
    addButtonText: {
      color: colors.onAccent || '#FFFFFF',
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
    },
    cancelButtonText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontFamily: 'Inter_500Medium',
    },
    searchWrap: {
      paddingHorizontal: 20,
      paddingBottom: 16,
    },
    searchBar: {
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
    },
    searchInput: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      padding: 0,
    },
    listContent: {
      paddingBottom: spacing.screen,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    rowBody: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    rowTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    name: {
      color: colors.textPrimary,
      fontSize: 15.5,
      fontFamily: 'Inter_600SemiBold',
    },
    nameUnread: {
      color: colors.textSecondary,
      fontFamily: 'Inter_500Medium',
    },
    time: {
      color: colors.textTertiary,
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
    },
    timeUnread: {
      color: colors.accent,
      fontFamily: 'Inter_500Medium',
    },
    rowBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    preview: {
      flex: 1,
      color: colors.textSecondary,
      fontSize: 13.5,
      fontFamily: 'Inter_400Regular',
    },
    previewUnread: {
      color: colors.textTertiary,
    },
    badge: {
      width: 19,
      height: 19,
      borderRadius: 10,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
    },
    badgeText: {
      color: colors.onAccent,
      fontSize: 11,
      fontFamily: 'Inter_700Bold',
    },
  });
}
