import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import Avatar from '../components/Avatar';
import { SearchIcon, PlusIcon } from '../components/icons';
import { useTheme } from '../theme';
import { connectSocket } from '../api/socket';
import useSocketListener from '../hooks/useSocketListener';
import { fetchAllUsers, searchUserByEmail } from '../api/client';
import * as SecureStore from 'expo-secure-store';
import { useToast } from '../context/ToastContext';
import { hybridDecrypt } from '../crypto/hybrid';

export default function ContactsScreen({ navigation }) {
  const { colors, spacing } = useTheme();
  const styles = useMemo(() => createStyles(colors, spacing), [colors, spacing]);
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState([]);
  const [liveStatus, setLiveStatus] = useState({});
  const [deletedIds, setDeletedIds] = useState([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [addError, setAddError] = useState('');

  useEffect(() => {
    async function loadDeletedList() {
      try {
        const stored = await SecureStore.getItemAsync('deleted_contacts_list');
        if (stored) {
          setDeletedIds(stored.split(','));
        }
      } catch (e) {
        console.error('Failed to load deleted list', e);
      }
    }
    loadDeletedList();
  }, []);

  useEffect(() => {
    connectSocket().catch(() => {});
    
    async function loadContacts() {
      try {
        const users = await fetchAllUsers();
        const formatted = users.map((u) => ({
          id: String(u.id),
          name: u.name,
          initials: (u.name || '')
            .split(' ')
            .filter(Boolean)
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2) || '?',
          status: u.status || 'offline',
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
    onMessage: async (payload) => {
      const enabled = await SecureStore.getItemAsync('notifications_enabled');
      if (enabled === 'false') return;

      try {
        const key = await SecureStore.getItemAsync('rsa_private_key');
        if (!key) return;

        const decrypted = await hybridDecrypt(payload, key);
        let preview = decrypted;
        try {
          const fileData = JSON.parse(decrypted);
          if (fileData.type === 'file') preview = `📎 File: ${fileData.filename}`;
        } catch (_) {}

        const sender = contacts.find((c) => String(c.id) === String(payload.sender_id));
        const senderName = sender ? sender.name : 'Unknown User';

        showToast(`New message from ${senderName}: ${preview}`, 'success');
      } catch (err) {
        console.warn('Failed to decrypt in-app toast message:', err.message);
      }
    }
  });

  const contactsWithLiveStatus = useMemo(
    () => contacts.map((c) => ({ ...c, status: liveStatus[c.id] ?? c.status })),
    [contacts, liveStatus],
  );

  const filtered = useMemo(() => {
    let base = contactsWithLiveStatus.filter((c) => !deletedIds.includes(c.id));
    if (!query.trim()) return base;
    const q = query.trim().toLowerCase();
    return base.filter((c) => c.name.toLowerCase().includes(q));
  }, [query, contactsWithLiveStatus, deletedIds]);

  const handleLongPressContact = (contact) => {
    Alert.alert(
      'Manage Contact',
      `What would you like to do with ${contact.name}?`,
      [
        {
          text: 'Delete Contact',
          style: 'destructive',
          onPress: () => confirmDeleteContact(contact.id),
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const confirmDeleteContact = async (contactId) => {
    try {
      const updated = [...deletedIds, String(contactId)];
      setDeletedIds(updated);
      await SecureStore.setItemAsync('deleted_contacts_list', updated.join(','));
      showToast('Contact deleted from list.', 'success');
    } catch (e) {
      console.error('Failed to delete contact', e);
    }
  };

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
        initials: (user.name || '')
          .split(' ')
          .filter(Boolean)
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2) || '?',
        status: user.status || 'offline',
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
            onLongPress={() => handleLongPressContact(item)}
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
      paddingHorizontal: 24,
      paddingTop: 16,
      paddingBottom: 16,
      backgroundColor: colors.screen,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      color: colors.textPrimary,
      fontSize: 24,
      fontFamily: 'Inter_700Bold',
      letterSpacing: -0.5,
    },
    headerButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addContactCard: {
      backgroundColor: colors.surface,
      marginHorizontal: 24,
      marginTop: 16,
      marginBottom: 8,
      borderRadius: 16,
      padding: 20,
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 10,
      elevation: 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    addContactTitle: {
      color: colors.textPrimary,
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
      marginBottom: 12,
    },
    addContactInput: {
      height: 44,
      borderRadius: 10,
      backgroundColor: colors.surfaceAlt,
      borderColor: colors.border,
      borderWidth: 1,
      paddingHorizontal: 14,
      color: colors.textPrimary,
      fontSize: 14.5,
      fontFamily: 'Inter_400Regular',
      marginBottom: 12,
    },
    addErrorText: {
      color: colors.destructive,
      fontSize: 12.5,
      fontFamily: 'Inter_400Regular',
      marginBottom: 12,
    },
    addContactButtons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
    },
    addButton: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 8,
      backgroundColor: colors.accent,
    },
    cancelButton: {
      backgroundColor: 'transparent',
    },
    addButtonText: {
      color: '#FFFFFF',
      fontSize: 13.5,
      fontFamily: 'Inter_600SemiBold',
    },
    cancelButtonText: {
      color: colors.textSecondary,
      fontSize: 13.5,
      fontFamily: 'Inter_500Medium',
    },
    searchWrap: {
      paddingHorizontal: 24,
      paddingTop: 16,
      paddingBottom: 8,
    },
    searchBar: {
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.surfaceAlt,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchInput: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 14,
      fontFamily: 'Inter_400Regular',
      padding: 0,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: spacing.screen,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: colors.surface,
      borderRadius: 16,
      marginBottom: 10,
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.03,
      shadowRadius: 6,
      elevation: 1,
      borderWidth: 1,
      borderColor: colors.border,
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
      fontFamily: 'Inter_700Bold',
    },
    time: {
      color: colors.textTertiary,
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
    },
    timeUnread: {
      color: colors.accent,
      fontFamily: 'Inter_600SemiBold',
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
      color: colors.textPrimary,
      fontFamily: 'Inter_500Medium',
    },
    badge: {
      minWidth: 19,
      height: 19,
      borderRadius: 10,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
      marginLeft: 8,
    },
    badgeText: {
      color: '#FFFFFF',
      fontSize: 10.5,
      fontFamily: 'Inter_700Bold',
    },
  });
}
