import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import Avatar from '../components/Avatar';
import {
  SearchIcon,
  XIcon,
  CheckIcon,
  UserPlusIcon,
  PlusIcon,
} from '../components/icons';
import { useTheme } from '../theme';
import { connectSocket } from '../api/socket';
import useSocketListener from '../hooks/useSocketListener';
import {
  fetchConnections,
  fetchPendingRequests,
  searchUsersToConnect,
  sendConnectionRequest,
  acceptConnection,
  rejectConnection,
} from '../api/client';
import * as SecureStore from 'expo-secure-store';
import { useToast } from '../context/ToastContext';
import { useActiveChat } from '../context/ActiveChatContext';
import { showMessageNotification } from '../api/notifications';
import { hybridDecrypt } from '../crypto/hybrid';

function makeContact(u) {
  return {
    id: String(u.id),
    name: u.name,
    email: u.email,
    initials: u.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2),
    status: u.status || 'offline',
    lastMessage: 'Start a new conversation',
    time: '',
    unread: 0,
    read: true,
    connection_id: u.connection_id,
  };
}

function initials(name = '') {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
}

// ─── Add-contact modal ──────────────────────────────────────────────────────

function AddContactModal({ visible, onClose, onRequestSent, colors }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [visible]);

  const handleSearch = useCallback((text) => {
    setQuery(text);
    clearTimeout(debounceRef.current);
    if (text.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try { setResults(await searchUsersToConnect(text.trim())); }
      catch { setResults([]); }
      finally { setLoading(false); }
    }, 350);
  }, []);

  const handleSendRequest = async (user) => {
    setActionLoading((p) => ({ ...p, [user.id]: true }));
    try {
      await sendConnectionRequest(user.id);
      setResults((prev) =>
        prev.map((u) => u.id === user.id ? { ...u, connection_status: 'pending', is_requester: true } : u)
      );
      onRequestSent(user);
    } catch (e) {
      setResults((prev) =>
        prev.map((u) => u.id === user.id
          ? { ...u, connection_status: e?.response?.data?.detail?.includes('pending') ? 'pending' : u.connection_status, is_requester: true }
          : u)
      );
    } finally {
      setActionLoading((p) => ({ ...p, [user.id]: false }));
    }
  };

  const ms = useMemo(() => modalStyles(colors), [colors]);

  const renderResult = ({ item }) => {
    const isPending = item.connection_status === 'pending';
    const isAccepted = item.connection_status === 'accepted';
    const isSentByMe = isPending && item.is_requester;
    const isSentToMe = isPending && !item.is_requester;
    const isLoading = actionLoading[item.id];

    return (
      <View style={ms.resultRow}>
        <Avatar initials={initials(item.name)} size={44} />
        <View style={ms.resultInfo}>
          <Text style={ms.resultName}>{item.name}</Text>
          <Text style={ms.resultEmail} numberOfLines={1}>{item.email}</Text>
        </View>
        <View style={ms.resultAction}>
          {isLoading ? <ActivityIndicator size="small" color={colors.accent} />
            : isAccepted ? (
              <View style={ms.connectedBadge}>
                <CheckIcon size={12} color={colors.accent} />
                <Text style={[ms.statusText, { color: colors.accent }]}>Connected</Text>
              </View>
            ) : isSentByMe ? (
              <Text style={[ms.statusText, { color: colors.textTertiary }]}>Pending</Text>
            ) : isSentToMe ? (
              <Text style={[ms.statusText, { color: colors.accent }]}>Respond</Text>
            ) : (
              <Pressable style={ms.addBtn} onPress={() => handleSendRequest(item)}>
                <UserPlusIcon size={14} color="#fff" />
                <Text style={ms.addBtnText}>Add</Text>
              </Pressable>
            )}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'}
      onRequestClose={onClose}
    >
      <View style={ms.sheet}>
        <View style={ms.handle} />
        <View style={ms.sheetHeader}>
          <Text style={ms.sheetTitle}>Add Contact</Text>
          <Pressable onPress={onClose}><Text style={ms.doneBtnText}>Done</Text></Pressable>
        </View>
        <View style={ms.searchBarWrap}>
          <View style={ms.searchBar}>
            <SearchIcon size={16} color={colors.textTertiary} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={handleSearch}
              placeholder="Search by name or email"
              placeholderTextColor={colors.textTertiary}
              style={ms.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={Keyboard.dismiss}
            />
            {query.length > 0 && (
              <Pressable onPress={() => handleSearch('')} hitSlop={8}>
                <View style={ms.clearBtn}><XIcon size={10} color={colors.textTertiary} /></View>
              </Pressable>
            )}
          </View>
        </View>
        {loading ? (
          <View style={ms.centered}><ActivityIndicator color={colors.accent} /></View>
        ) : query.trim().length < 2 ? (
          <View style={ms.centered}><Text style={ms.hintText}>Type at least 2 characters to search</Text></View>
        ) : results.length === 0 ? (
          <View style={ms.centered}><Text style={ms.hintText}>No users found</Text></View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={ms.resultList}
            keyboardShouldPersistTaps="handled"
            renderItem={renderResult}
          />
        )}
      </View>
    </Modal>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function ContactsScreen({ navigation }) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { activeChatId } = useActiveChat();

  const [contacts, setContacts] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [liveStatus, setLiveStatus] = useState({});
  const [query, setQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [actionLoading, setActionLoading] = useState({});

  const [connectionStatus, setConnectionStatus] = useState('connecting');

  useEffect(() => {
    let socket;
    async function initSocket() {
      try {
        socket = await connectSocket();
        if (socket) {
          setConnectionStatus(socket.connected ? 'connected' : 'connecting');
          socket.on('connect', () => setConnectionStatus('connected'));
          socket.on('disconnect', () => setConnectionStatus('disconnected'));
          socket.on('connect_error', () => setConnectionStatus('disconnected'));
        }
      } catch (e) {
        setConnectionStatus('disconnected');
      }
    }
    initSocket();

    async function load() {
      try {
        const [conns, pending] = await Promise.all([fetchConnections(), fetchPendingRequests()]);
        const privateKey = await SecureStore.getItemAsync('rsa_private_key');

        const contactsWithPreviews = await Promise.all(
          conns.map(async (u) => {
            const base = makeContact(u);
            if (u.last_message && privateKey) {
              try {
                const decrypted = await hybridDecrypt(u.last_message, privateKey);
                let preview = decrypted;
                try {
                  const fd = JSON.parse(decrypted);
                  if (fd.type === 'file') preview = `📎 ${fd.filename}`;
                } catch (_) {}
                const ts = u.last_message.timestamp;
                const utc = ts.endsWith('Z') ? ts : ts + 'Z';
                const date = new Date(utc);
                const now = new Date();
                const isToday = date.toDateString() === now.toDateString();
                const time = isToday
                  ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
                base.lastMessage = preview;
                base.time = time;
              } catch (_) {}
            }
            return base;
          })
        );

        setContacts(contactsWithPreviews);
        setPendingRequests(pending);
      } catch (e) {
        console.error('Failed to load contacts', e);
      }
    }
    load();

    return () => {
      if (socket) {
        socket.off('connect');
        socket.off('disconnect');
        socket.off('connect_error');
      }
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPendingRequests().then(setPendingRequests).catch(() => {});
    }, []),
  );

  useSocketListener({
    onStatusUpdate: ({ user_id, status }) => {
      setLiveStatus((prev) => ({ ...prev, [String(user_id)]: status }));
    },
    onMessage: async (payload) => {
      const senderId = String(payload.sender_id);
      try {
        const key = await SecureStore.getItemAsync('rsa_private_key');
        if (!key) return;
        const decrypted = await hybridDecrypt(payload, key);
        let preview = decrypted;
        try {
          const fd = JSON.parse(decrypted);
          if (fd.type === 'file') preview = `📎 ${fd.filename}`;
        } catch (_) {}

        const now = new Date();
        const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Update last message preview in the list
        setContacts((prev) =>
          prev.map((c) =>
            String(c.id) === senderId ? { ...c, lastMessage: preview, time } : c
          )
        );

        if (payload.is_catchup) return;
        if (senderId === activeChatId) return;
        const enabled = await SecureStore.getItemAsync('notifications_enabled');
        if (enabled === 'false') return;
        const sender = contacts.find((c) => String(c.id) === senderId);
        await showMessageNotification(sender?.name ?? 'New message', preview, payload.sender_id);
      } catch (_) {}
    },
    onConnectionRequest: (payload) => {
      setPendingRequests((prev) => {
        if (prev.some((r) => r.connection_id === payload.connection_id)) return prev;
        return [...prev, { connection_id: payload.connection_id, id: payload.requester_id, name: payload.requester_name }];
      });
      showToast(`${payload.requester_name} wants to connect`, 'success');
    },
    onConnectionAccepted: (payload) => {
      const id = String(payload.accepted_by_id);
      setContacts((prev) => {
        if (prev.some((c) => c.id === id)) return prev;
        return [makeContact({ id: payload.accepted_by_id, name: payload.accepted_by_name, status: 'online', connection_id: payload.connection_id }), ...prev];
      });
      showToast(`${payload.accepted_by_name} accepted your request`, 'success');
    },
    onConnectionRejected: (payload) => {
      showToast(`${payload.rejected_by_name} declined your request`, 'error');
    },
  });

  const handleAccept = async (req) => {
    setActionLoading((p) => ({ ...p, [req.connection_id]: 'accept' }));
    try {
      await acceptConnection(req.connection_id);
      setPendingRequests((prev) => prev.filter((r) => r.connection_id !== req.connection_id));
      setContacts((prev) => {
        if (prev.some((c) => c.id === String(req.id))) return prev;
        return [makeContact({ id: req.id, name: req.name, status: 'offline', connection_id: req.connection_id }), ...prev];
      });
    } catch {
      showToast('Failed to accept request', 'error');
    } finally {
      setActionLoading((p) => ({ ...p, [req.connection_id]: undefined }));
    }
  };

  const handleReject = async (req) => {
    setActionLoading((p) => ({ ...p, [req.connection_id]: 'reject' }));
    try {
      await rejectConnection(req.connection_id);
      setPendingRequests((prev) => prev.filter((r) => r.connection_id !== req.connection_id));
    } catch {
      showToast('Failed to decline request', 'error');
    } finally {
      setActionLoading((p) => ({ ...p, [req.connection_id]: undefined }));
    }
  };

  const contactsWithLiveStatus = useMemo(
    () => contacts.map((c) => ({ ...c, status: liveStatus[c.id] ?? c.status })),
    [contacts, liveStatus],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return contactsWithLiveStatus;
    const q = query.trim().toLowerCase();
    return contactsWithLiveStatus.filter((c) => c.name.toLowerCase().includes(q));
  }, [query, contactsWithLiveStatus]);

  const ListHeader = (
    <>
      {/* Search bar */}
      <View style={styles.searchWrap}>
        <View style={[styles.searchBar, { backgroundColor: colors.searchBg }]}>
          <SearchIcon color="#999" size={16} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search"
            placeholderTextColor={colors.textTertiary}
            style={[styles.searchInput, { color: colors.textPrimary }]}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <View style={styles.searchClear}><XIcon size={10} color="#999" /></View>
            </Pressable>
          )}
        </View>
      </View>

      {/* Pending requests */}
      {pendingRequests.length > 0 && (
        <View style={[styles.requestsSection, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={[styles.requestsLabel, { color: colors.textTertiary }]}>Connection Requests</Text>
          {pendingRequests.map((req) => {
            const loading = actionLoading[req.connection_id];
            return (
              <View key={req.connection_id} style={styles.requestRow}>
                <Avatar initials={initials(req.name)} size={44} />
                <Text style={[styles.requestName, { color: colors.textPrimary }]} numberOfLines={1}>{req.name}</Text>
                <View style={styles.requestActions}>
                  <Pressable
                    style={[styles.reqBtn, styles.reqBtnDecline, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                    onPress={() => handleReject(req)}
                    disabled={!!loading}
                  >
                    {loading === 'reject'
                      ? <ActivityIndicator size="small" color={colors.textSecondary} />
                      : <Text style={[styles.reqBtnText, { color: colors.textSecondary }]}>Decline</Text>}
                  </Pressable>
                  <Pressable
                    style={[styles.reqBtn, { backgroundColor: colors.accent }]}
                    onPress={() => handleAccept(req)}
                    disabled={!!loading}
                  >
                    {loading === 'accept'
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={[styles.reqBtnText, { color: '#fff' }]}>Accept</Text>}
                  </Pressable>
                </View>
              </View>
            );
          })}
          <View style={[styles.sectionSep, { backgroundColor: colors.border, marginTop: 12 }]} />
        </View>
      )}
    </>
  );

  return (
    <ScreenContainer>
      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: colors.screen }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Chats</Text>
        <View style={styles.headerActions}>
          <View style={[styles.statusBadge, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <View style={[styles.statusDot, {
              backgroundColor: connectionStatus === 'connected' ? colors.online
                             : connectionStatus === 'connecting' ? '#FF9500'
                             : colors.destructive
            }]} />
            <Text style={[styles.statusTextText, { color: colors.textSecondary }]}>
              {connectionStatus === 'connected' ? 'Connected'
               : connectionStatus === 'connecting' ? 'Connecting'
               : 'Offline'}
            </Text>
          </View>
          <Pressable style={[styles.headerIconBtn, { backgroundColor: colors.surfaceAlt }]} onPress={() => setShowModal(true)}>
            <PlusIcon size={18} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      {/* ── Chat list ── */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={ListHeader}
        style={{ backgroundColor: colors.screen }}
        contentContainerStyle={filtered.length === 0 ? { flexGrow: 1 } : undefined}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No contacts yet</Text>
            <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>Tap the pencil icon to find people</Text>
          </View>
        }
        ItemSeparatorComponent={() => (
          <View style={[styles.rowSep, { backgroundColor: colors.border }]} />
        )}
        renderItem={({ item }) => {
          const isOnline = (liveStatus[item.id] ?? item.status) === 'online';
          return (
            <Pressable
              style={[styles.row, { backgroundColor: colors.screen }]}
              onPress={() => navigation.navigate('Chat', { contact: item })}
            >
              {/* Avatar with online dot */}
              <View style={styles.avatarWrap}>
                <Avatar initials={item.initials} size={54} />
                {isOnline && (
                  <View style={[styles.onlineDot, { backgroundColor: colors.online, borderColor: colors.screen }]} />
                )}
              </View>

              {/* Text */}
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text style={[styles.rowName, { color: colors.textPrimary }, !item.read && styles.rowNameUnread]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.time ? (
                    <Text style={[styles.rowTime, { color: item.unread > 0 ? colors.accent : colors.textTertiary }]}>
                      {item.time}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.rowBottom}>
                  <Text style={[styles.rowPreview, { color: colors.textSecondary }, !item.read && { color: colors.textPrimary, fontFamily: 'Inter_500Medium' }]} numberOfLines={1}>
                    {item.lastMessage}
                  </Text>
                  {item.unread > 0 && (
                    <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                      <Text style={styles.badgeText}>{item.unread}</Text>
                    </View>
                  )}
                </View>
              </View>
            </Pressable>
          );
        }}
      />

      <AddContactModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        colors={colors}
        onRequestSent={(user) => showToast(`Request sent to ${user.name}`, 'success')}
      />
    </ScreenContainer>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  headerTitle: {
    flex: 1,
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
    marginLeft: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusTextText: {
    fontSize: 11.5,
    fontFamily: 'Inter_500Medium',
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Search */
  searchWrap: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    paddingTop: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 38,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: '#111',
    padding: 0,
  },
  searchClear: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Separators */
  sectionSep: {
    height: 1,
    marginHorizontal: 16,
  },

  /* Pending requests */
  requestsSection: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  requestsLabel: {
    fontSize: 11.5,
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  requestName: {
    flex: 1,
    fontSize: 14.5,
    fontFamily: 'Inter_500Medium',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  reqBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    minWidth: 72,
    alignItems: 'center',
  },
  reqBtnDecline: {
    borderWidth: 1,
  },
  reqBtnText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },

  /* Chat rows */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  rowSep: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 82,
  },
  avatarWrap: {
    position: 'relative',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowName: {
    fontSize: 15.5,
    fontFamily: 'Inter_600SemiBold',
    flex: 1,
  },
  rowNameUnread: {
    fontFamily: 'Inter_700Bold',
  },
  rowTime: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginLeft: 6,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowPreview: {
    flex: 1,
    fontSize: 13.5,
    fontFamily: 'Inter_400Regular',
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    marginLeft: 8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10.5,
    fontFamily: 'Inter_700Bold',
  },

  /* Empty state */
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
  },
  emptyHint: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
});

// ─── Modal styles ────────────────────────────────────────────────────────────

function modalStyles(colors) {
  return StyleSheet.create({
    sheet: { flex: 1, backgroundColor: colors.screen },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
    sheetTitle: { color: colors.textPrimary, fontSize: 18, fontFamily: 'Inter_700Bold', letterSpacing: -0.3 },
    doneBtnText: { color: colors.accent, fontSize: 16, fontFamily: 'Inter_600SemiBold' },
    searchBarWrap: { paddingHorizontal: 16, paddingBottom: 12 },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.searchBg, borderRadius: 12, paddingHorizontal: 12, height: 44, gap: 8 },
    searchInput: { flex: 1, color: colors.textPrimary, fontSize: 15, fontFamily: 'Inter_400Regular', padding: 0 },
    clearBtn: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
    hintText: { color: colors.textTertiary, fontSize: 14, fontFamily: 'Inter_400Regular' },
    resultList: { paddingHorizontal: 16, paddingBottom: 40, gap: 2 },
    resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 12 },
    resultInfo: { flex: 1, minWidth: 0 },
    resultName: { color: colors.textPrimary, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
    resultEmail: { color: colors.textSecondary, fontSize: 12.5, fontFamily: 'Inter_400Regular', marginTop: 1 },
    resultAction: { alignItems: 'flex-end', justifyContent: 'center', minWidth: 80 },
    addBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.accent, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
    addBtnText: { color: '#FFFFFF', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
    connectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    statusText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  });
}
