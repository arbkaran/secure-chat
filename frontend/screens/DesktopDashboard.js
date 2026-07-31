import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Image,
  ScrollView,
  Platform,
  useWindowDimensions,
  Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';

import { useTheme } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { getSocket, connectSocket } from '../api/socket';
import useSocketListener from '../hooks/useSocketListener';
import {
  uploadFile,
  downloadFile,
  fetchAllUsers,
  searchUserByEmail,
  fetchMessages,
  fetchCurrentUser,
  fetchPublicKey,
} from '../api/client';
import { hybridEncrypt, hybridDecrypt } from '../crypto/hybrid';
import {
  ShieldIcon,
  SearchIcon,
  PlusIcon,
  MoreVerticalIcon,
  DoubleCheckIcon,
  PaperclipIcon,
  SendIcon,
  BellIcon,
  LogOutIcon,
  SmileIcon,
  MicIcon,
  XIcon,
  CheckIcon,
  ShieldCheckIcon,
  GlobeIcon,
  ActivityIcon,
  KeyIcon,
  TimerIcon,
  InfoIcon,
} from '../components/icons';
import Avatar from '../components/Avatar';

export default function DesktopDashboard() {
  const { logout, userId } = useAuth();
  const { colors, spacing } = useTheme();
  const { showToast } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Profiles & Contacts
  const [currentUser, setCurrentUser] = useState({ name: 'Loading...', email: '' });
  const [profilePictureUri, setProfilePictureUri] = useState(null);
  const [deletedIds, setDeletedIds] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activeContact, setActiveContact] = useState(null);
  const [liveStatus, setLiveStatus] = useState({});
  const [privateKey, setPrivateKey] = useState(null);
  const [recipientPubKey, setRecipientPubKey] = useState(null);

  // Lists & Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [userSearchEmail, setUserSearchEmail] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Messages
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState(null);
  const [fileUploading, setFileUploading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [downloadingFiles, setDownloadingFiles] = useState({});
  const [decryptedFiles, setDecryptedFiles] = useState({});

  // UI Panels
  const [showSecurityPanel, setShowSecurityPanel] = useState(true);
  const [sessionStartTime] = useState(new Date().toLocaleTimeString());

  // Socket Connection Status
  const [socketConnected, setSocketConnected] = useState(false);

  // Ref for auto scroll
  const flatListRef = useRef(null);

  // Initialize
  useEffect(() => {
    connectSocket()
      .then(() => setSocketConnected(true))
      .catch(() => setSocketConnected(false));

    async function init() {
      // Load current user
      try {
        const u = await fetchCurrentUser();
        setCurrentUser(u);
      } catch (err) {
        console.error('Failed to load profile', err);
      }

      // Load RSA private key
      const key = await SecureStore.getItemAsync('rsa_private_key');
      setPrivateKey(key);

      // Load local settings
      const avatar = await SecureStore.getItemAsync('profile_picture_uri');
      if (avatar) setProfilePictureUri(avatar);

      const storedDeleted = await SecureStore.getItemAsync('deleted_contacts_list');
      if (storedDeleted) setDeletedIds(storedDeleted.split(','));

      // Load contacts
      await refreshContacts();
    }
    init();
  }, []);

  const refreshContacts = async () => {
    try {
      const users = await fetchAllUsers();
      const formatted = users.map((u) => ({
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
        lastMessage: 'Start a secure chat',
        time: '',
        unread: 0,
        read: true,
      }));
      setContacts(formatted);
    } catch (e) {
      console.error('Failed to load contacts', e);
    }
  };

  // Sync recipient public key when active contact changes
  useEffect(() => {
    if (!activeContact) {
      setRecipientPubKey(null);
      setMessages([]);
      return;
    }

    async function loadRecipientKey() {
      try {
        const key = await fetchPublicKey(activeContact.id);
        setRecipientPubKey(key);
      } catch (e) {
        setRecipientPubKey(null);
      }
    }
    loadRecipientKey();
  }, [activeContact]);

  // Load message history when contact & keys are ready
  useEffect(() => {
    if (!activeContact || !privateKey || !recipientPubKey) return;

    async function loadHistory() {
      setLoadingHistory(true);
      try {
        const clearedAt = await SecureStore.getItemAsync('cleared_at_' + activeContact.id);
        const history = await fetchMessages(activeContact.id);
        const decryptedHistory = [];

        for (const msg of history) {
          if (clearedAt && new Date(msg.timestamp) <= new Date(clearedAt)) {
            continue;
          }
          try {
            const decryptedText = await hybridDecrypt(msg, privateKey);
            const isOutgoing = String(msg.sender_id) !== String(activeContact.id);
            const utcTime = msg.timestamp.endsWith('Z') ? msg.timestamp : msg.timestamp + 'Z';

            let parsedMsg = {
              id: String(msg.message_id),
              type: isOutgoing ? 'outgoing' : 'incoming',
              text: decryptedText,
              time: new Date(utcTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              read: true,
            };

            try {
              const fileData = JSON.parse(decryptedText);
              if (fileData.type === 'file') {
                parsedMsg.fileData = fileData;
                parsedMsg.text = `Sent a file: ${fileData.filename}`;
              }
            } catch (_) {}

            decryptedHistory.push(parsedMsg);
          } catch (decryptionError) {
            const isOutgoing = String(msg.sender_id) !== String(activeContact.id);
            const utcTime = msg.timestamp.endsWith('Z') ? msg.timestamp : msg.timestamp + 'Z';
            decryptedHistory.push({
              id: String(msg.message_id),
              type: isOutgoing ? 'outgoing' : 'incoming',
              text: '🔒 [Decryption Failed]',
              time: new Date(utcTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            });
          }
        }

        const uniqueHistory = [];
        const seenIds = new Set();
        for (const item of decryptedHistory) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            uniqueHistory.push(item);
          }
        }
        setMessages(uniqueHistory);
      } catch (e) {
        console.error('Failed to load message history', e);
      } finally {
        setLoadingHistory(false);
      }
    }
    loadHistory();
  }, [activeContact, privateKey, recipientPubKey]);

  // Real-time socket events
  useSocketListener({
    onMessage: async (payload) => {
      // Update contact list preview
      setContacts((prev) =>
        prev.map((c) =>
          String(c.id) === String(payload.sender_id)
            ? { ...c, lastMessage: 'File / Message Received', unread: c.unread + 1 }
            : c
        )
      );

      if (!activeContact || String(payload.sender_id) !== String(activeContact.id)) {
        // Background / other contact message received
        const notificationsEnabled = await SecureStore.getItemAsync('notifications_enabled');
        if (notificationsEnabled !== 'false') {
          try {
            const decryptedText = await hybridDecrypt(payload, privateKey);
            let preview = decryptedText;
            try {
              const fileData = JSON.parse(decryptedText);
              if (fileData.type === 'file') preview = `📎 File: ${fileData.filename}`;
            } catch (_) {}
            const sender = contacts.find((c) => String(c.id) === String(payload.sender_id));
            const senderName = sender ? sender.name : 'Unknown User';
            showToast(`New message from ${senderName}: ${preview}`, 'success');
          } catch (e) {
            console.error('Failed to decrypt background notification', e);
          }
        }
      }

      if (activeContact && String(payload.sender_id) === String(activeContact.id)) {
        try {
          const decryptedText = await hybridDecrypt(payload, privateKey);
          let parsedMessage = {
            id: String(payload.message_id || Date.now() + Math.random()),
            type: 'incoming',
            text: decryptedText,
            time: new Date(payload.timestamp || Date.now()).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
          };

          try {
            const fileData = JSON.parse(decryptedText);
            if (fileData.type === 'file') {
              parsedMessage.fileData = fileData;
              parsedMessage.text = `Sent a file: ${fileData.filename}`;
            }
          } catch (_) {}

          setMessages((prev) => {
            if (prev.some((m) => m.id === parsedMessage.id)) return prev;
            return [...prev, parsedMessage];
          });

          // Send read receipt
          const socket = getSocket();
          if (socket && payload.message_id) {
            socket.emit('read_receipt', { message_id: payload.message_id });
          }
        } catch (e) {
          console.error('Failed to decrypt incoming message', e);
        }
      }
    },
    onStatusUpdate: ({ user_id, status }) => {
      setLiveStatus((prev) => ({ ...prev, [user_id]: status }));
      setContacts((prev) =>
        prev.map((c) => (String(c.id) === String(user_id) ? { ...c, status } : c))
      );
      if (activeContact && String(activeContact.id) === String(user_id)) {
        setActiveContact((prev) => ({ ...prev, status }));
      }
    },
    onTyping: ({ sender_id }) => {
      if (activeContact && String(sender_id) === String(activeContact.id)) {
        setIsTyping(true);
        if (typingTimeout) clearTimeout(typingTimeout);
        setTypingTimeout(
          setTimeout(() => {
            setIsTyping(false);
          }, 1500)
        );
      }
    },
  });

  const handleSend = async (textToSend = draft) => {
    const trimmed = textToSend.trim();
    if (!trimmed) return;

    if (!recipientPubKey) {
      showToast('Recipient setup has not finished (no public key).', 'error');
      return;
    }

    if (textToSend === draft) {
      setDraft('');
    }

    try {
      const encrypted = hybridEncrypt(trimmed, recipientPubKey);
      const socket = getSocket();
      let msgId = String(Date.now() + Math.random());

      if (socket) {
        socket.emit('message', {
          receiver_id: Number(activeContact.id),
          ...encrypted,
        });
      }

      let localMsg = {
        id: msgId,
        type: 'outgoing',
        text: trimmed,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        read: false,
      };

      try {
        const fileData = JSON.parse(trimmed);
        if (fileData.type === 'file') {
          localMsg.fileData = fileData;
          localMsg.text = `Sent a file: ${fileData.filename}`;
        }
      } catch (_) {}

      setMessages((prev) => {
        if (prev.some((m) => m.id === localMsg.id)) return prev;
        return [...prev, localMsg];
      });

      // Update last message in contacts list
      setContacts((prev) =>
        prev.map((c) =>
          String(c.id) === String(activeContact.id)
            ? { ...c, lastMessage: localMsg.text, time: localMsg.time }
            : c
        )
      );
    } catch (e) {
      showToast('Encryption failed. Could not send message.', 'error');
    }
  };

  // File attachments
  const handleAttachPress = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        await processAndUploadFile(asset.uri, asset.name, asset.mimeType);
      }
    } catch (e) {
      showToast('Failed to select file.', 'error');
    }
  };

  const processAndUploadFile = async (uri, filename, mimeType) => {
    const cleanFilename = decodeURIComponent(filename);
    if (!recipientPubKey) {
      showToast('Recipient keys not loaded yet.', 'error');
      return;
    }

    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);
      const MAX_FILE_SIZE = 5 * 1024 * 1024;
      if (fileInfo.exists && fileInfo.size > MAX_FILE_SIZE) {
        showToast('The file size exceeds the 5MB limit.', 'error');
        return;
      }
    } catch (sizeErr) {
      console.warn('Could not check file size:', sizeErr);
    }

    setFileUploading(true);
    showToast('Encrypting and uploading file...', 'warning');

    try {
      const fileBytes = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });

      const encryptedFile = hybridEncrypt(fileBytes, recipientPubKey);

      const tempPath = `${FileSystem.cacheDirectory}${cleanFilename}.enc`;
      await FileSystem.writeAsStringAsync(tempPath, encryptedFile.ciphertext, {
        encoding: 'base64',
      });

      const uploadResult = await uploadFile({
        receiverId: Number(activeContact.id),
        encryptedAesKey: encryptedFile.encrypted_aes_key,
        iv: encryptedFile.iv,
        tag: encryptedFile.tag,
        fileUri: tempPath,
        fileName: cleanFilename,
      });

      const fileMessage = {
        type: 'file',
        file_id: uploadResult.file_id,
        filename: cleanFilename,
        mimeType: mimeType || 'application/octet-stream',
      };

      await handleSend(JSON.stringify(fileMessage));
      await FileSystem.deleteAsync(tempPath, { idempotent: true });
      showToast('File sent successfully!', 'success');
    } catch (e) {
      console.error('File upload failed', e);
      showToast('File encryption or upload failed.', 'error');
    } finally {
      setFileUploading(false);
    }
  };

  const handleDownloadFile = async (fileId, filename) => {
    const cleanFilename = decodeURIComponent(filename);
    if (decryptedFiles[fileId]) {
      await Sharing.shareAsync(decryptedFiles[fileId]);
      return;
    }

    setDownloadingFiles((prev) => ({ ...prev, [fileId]: true }));
    showToast('Downloading and decrypting attachment...', 'warning');

    try {
      const encryptedFileData = await downloadFile(fileId);
      const decryptedBase64 = await hybridDecrypt(encryptedFileData, privateKey);

      const localPath = `${FileSystem.documentDirectory}${cleanFilename}`;
      await FileSystem.writeAsStringAsync(localPath, decryptedBase64, {
        encoding: 'base64',
      });

      setDecryptedFiles((prev) => ({ ...prev, [fileId]: localPath }));

      // Save to gallery if image
      if (isImage(cleanFilename)) {
        try {
          const permission = await MediaLibrary.requestPermissionsAsync();
          if (permission.granted) {
            await MediaLibrary.saveToLibraryAsync(localPath);
            showToast('Saved directly to your gallery!', 'success');
          }
        } catch (mediaErr) {
          console.warn('Could not save to gallery:', mediaErr);
        }
      }

      showToast('File decrypted successfully!', 'success');
      await Sharing.shareAsync(localPath);
    } catch (e) {
      console.error('File download/decryption failed', e);
      showToast('Could not download or decrypt file.', 'error');
    } finally {
      setDownloadingFiles((prev) => ({ ...prev, [fileId]: false }));
    }
  };

  // Searching users
  const handleSearchUsers = async () => {
    const query = userSearchEmail.trim().toLowerCase();
    if (!query) return;
    setSearching(true);
    setSearchError('');
    setSearchResults([]);

    try {
      const user = await searchUserByEmail(query);
      setSearchResults([user]);
    } catch (e) {
      setSearchError('User not found');
    } finally {
      setSearching(false);
    }
  };

  const handleEraseConversation = async () => {
    if (!activeContact) return;

    const performErase = async () => {
      try {
        const now = new Date().toISOString();
        await SecureStore.setItemAsync('cleared_at_' + activeContact.id, now);
        setMessages([]);
        showToast('Conversation erased successfully.', 'success');
      } catch (e) {
        console.error('Failed to erase conversation', e);
        showToast('Failed to erase conversation.', 'error');
      }
    };

    if (Platform.OS === 'web') {
      const confirm = window.confirm('Are you sure you want to erase this conversation completely? This cannot be undone.');
      if (confirm) performErase();
    } else {
      Alert.alert(
        'Erase Conversation',
        'Are you sure you want to erase this conversation completely? This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Erase', style: 'destructive', onPress: performErase },
        ]
      );
    }
  };

  const handleDeleteContact = async (contact) => {
    const confirm = window.confirm(`Are you sure you want to remove ${contact.name} from your chat list?`);
    if (!confirm) return;

    try {
      const updated = [...deletedIds, String(contact.id)];
      setDeletedIds(updated);
      await SecureStore.setItemAsync('deleted_contacts_list', updated.join(','));
      showToast('Contact removed from list.', 'success');
      if (activeContact && activeContact.id === contact.id) {
        setActiveContact(null);
      }
    } catch (e) {
      console.error('Failed to delete contact', e);
    }
  };

  const handlePickProfilePicture = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Denied', 'Please grant gallery permissions to select an avatar.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const sourceUri = result.assets[0].uri;
        const localUri = `${FileSystem.documentDirectory}profile_picture.png`;
        
        await FileSystem.copyAsync({
          from: sourceUri,
          to: localUri,
        });

        await SecureStore.setItemAsync('profile_picture_uri', localUri);
        setProfilePictureUri(localUri);
        showToast('Profile picture updated!', 'success');
      }
    } catch (e) {
      console.error('Failed to pick profile picture', e);
      showToast('Could not pick profile picture.', 'error');
    }
  };

  const handleAddSearchContact = async (user) => {
    if (contacts.some((c) => c.id === String(user.id))) {
      showToast('Contact already in list', 'warning');
      return;
    }

    const newContact = {
      id: String(user.id),
      name: user.name,
      email: user.email,
      initials: user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2),
      status: user.status || 'offline',
      lastMessage: 'Start a secure chat',
      time: '',
      unread: 0,
      read: true,
    };

    setContacts((prev) => [newContact, ...prev]);
    showToast(`${user.name} added to secure contacts!`, 'success');
    setUserSearchEmail('');
    setSearchResults([]);
    setActiveContact(newContact);
  };

  // Filter local contacts list
  const filteredContacts = useMemo(() => {
    let base = contacts.filter((c) => !deletedIds.includes(c.id));
    if (!searchQuery.trim()) return base;
    const q = searchQuery.toLowerCase();
    return base.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }, [searchQuery, contacts, deletedIds]);

  const isImage = (filename) => {
    const ext = filename?.toLowerCase() || '';
    return ext.endsWith('.png') || ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.gif') || ext.endsWith('.webp');
  };

  const isUrl = (text) => {
    if (typeof text !== 'string') return false;
    const pattern = new RegExp(
      '^(https?:\\/\\/)?' +
        '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' +
        '((\\d{1,3}\\.){3}\\d{1,3}))' +
        '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' +
        '(\\?[;&a-z\\d%_.~+=-]*)?' +
        '(\\#[-a-z\\d_]*)?$',
      'i'
    );
    return !!pattern.test(text);
  };

  const handlePressMessage = (text) => {
    if (isUrl(text)) {
      let url = text;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
      } else {
        Sharing.shareAsync(url);
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* 1. LEFT PANEL (Width: 320px) */}
      <View style={styles.leftPanel}>
        {/* Profile Card */}
        <View style={styles.profileHeader}>
          <Pressable onPress={handlePickProfilePicture} style={styles.profileAvatarContainer}>
            <Avatar
              initials={currentUser.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
              status="online"
              size={42}
              imageUri={profilePictureUri}
            />
            <View style={styles.avatarEditOverlayDesktop}>
              <Text style={styles.avatarEditTextDesktop}>EDIT</Text>
            </View>
          </Pressable>
          <View style={styles.profileText}>
            <Text style={styles.profileName} numberOfLines={1}>{currentUser.name}</Text>
            <Text style={styles.profileStatus}>🟢 Online (Device Local)</Text>
          </View>
          <Pressable onPress={logout} style={styles.logoutBtn} hitSlop={6}>
            <LogOutIcon size={18} color={colors.destructive} />
          </Pressable>
        </View>

        {/* Live User Search */}
        <View style={styles.searchSection}>
          <Text style={styles.sectionTitle}>Add Secure Contact</Text>
          <View style={styles.searchBar}>
            <TextInput
              value={userSearchEmail}
              onChangeText={(t) => { setUserSearchEmail(t); setSearchError(''); }}
              placeholder="Search by registered email..."
              placeholderTextColor={colors.textTertiary}
              style={styles.searchInput}
              onSubmitEditing={handleSearchUsers}
            />
            <Pressable onPress={handleSearchUsers} style={styles.searchIconBtn}>
              <PlusIcon size={18} color={colors.accent} />
            </Pressable>
          </View>
          {searching && <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: 6 }} />}
          {searchError ? <Text style={styles.errorText}>{searchError}</Text> : null}
          {searchResults.map((user) => (
            <View key={user.id} style={styles.searchResultCard}>
              <Avatar initials={user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)} status="offline" size={32} />
              <View style={{ flex: 1 }}>
                <Text style={styles.resultName}>{user.name}</Text>
                <Text style={styles.resultEmail}>{user.email}</Text>
              </View>
              <Pressable style={styles.addResultBtn} onPress={() => handleAddSearchContact(user)}>
                <Text style={styles.addResultText}>Add</Text>
              </Pressable>
            </View>
          ))}
        </View>

        {/* Contacts Search & Filter */}
        <View style={styles.localSearchWrap}>
          <View style={styles.localSearchBar}>
            <SearchIcon color={colors.textTertiary} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search chat list..."
              placeholderTextColor={colors.textTertiary}
              style={styles.localSearchInput}
            />
          </View>
        </View>

        {/* Contacts List */}
        <FlatList
          data={filteredContacts}
          keyExtractor={(item) => item.id}
          style={styles.contactsList}
          renderItem={({ item }) => {
            const isActive = activeContact && activeContact.id === item.id;
            return (
              <Pressable
                style={[styles.contactCard, isActive && styles.contactCardActive]}
                onPress={() => {
                  setActiveContact(item);
                  // Reset unread locally
                  setContacts((prev) =>
                    prev.map((c) => (c.id === item.id ? { ...c, unread: 0 } : c))
                  );
                }}
              >
                <Avatar initials={item.initials} status={item.status} size={40} />
                <View style={styles.contactDetails}>
                  <View style={styles.contactRow}>
                    <Text style={styles.contactName}>{item.name}</Text>
                    <Pressable
                      style={styles.deleteContactBtn}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleDeleteContact(item);
                      }}
                    >
                      <XIcon size={12} color={colors.textTertiary} />
                    </Pressable>
                  </View>
                  <View style={styles.contactRow}>
                    <Text style={styles.contactMsg} numberOfLines={1}>{item.lastMessage}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.contactTime}>{item.time}</Text>
                      {item.unread > 0 ? (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>{item.unread}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      </View>

      {/* 2. CENTER PANEL (Main Chat Area) */}
      <View style={styles.centerPanel}>
        {activeContact ? (
          <>
            {/* Active Header */}
            <View style={styles.chatHeader}>
              <Avatar initials={activeContact.initials} status={activeContact.status} size={42} />
              <View style={styles.chatHeaderText}>
                <Text style={styles.chatHeaderName}>{activeContact.name}</Text>
                <Text style={styles.chatHeaderStatus}>
                  {activeContact.status === 'online' ? '🟢 Online' : '⚪ Offline'}
                </Text>
              </View>
              <View style={styles.headerBadges}>
                <View style={styles.encryptionBadge}>
                  <Text style={styles.encryptionBadgeText}>🔒 End-to-End Encrypted</Text>
                </View>
                <Pressable
                  onPress={() => setShowSecurityPanel(!showSecurityPanel)}
                  style={[styles.headerIconBtn, showSecurityPanel && styles.headerIconBtnActive]}
                >
                  <InfoIcon size={20} color={showSecurityPanel ? colors.accent : colors.textSecondary} />
                </Pressable>
                <Pressable
                  onPress={handleEraseConversation}
                  style={styles.headerIconBtn}
                  title="Erase Conversation"
                >
                  <MoreVerticalIcon size={20} color={colors.destructive} />
                </Pressable>
              </View>
            </View>

            {/* Messages list */}
            {loadingHistory ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={styles.loadingText}>Decrypting messages from database...</Text>
              </View>
            ) : (
              <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.messageList}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                renderItem={({ item }) => {
                  const isOutgoing = item.type === 'outgoing';
                  const hasFile = !!item.fileData;

                  return (
                    <View style={[styles.bubbleRow, isOutgoing && styles.bubbleRowOutgoing]}>
                      <View style={[styles.bubble, isOutgoing ? styles.bubbleOutgoing : styles.bubbleIncoming]}>
                        {hasFile ? (
                          <View style={styles.fileContainer}>
                            <Text style={[styles.fileTitle, isOutgoing && styles.fileTitleOutgoing]}>
                              📎 {item.fileData.filename}
                            </Text>
                            {isImage(item.fileData.filename) && decryptedFiles[item.fileData.file_id] ? (
                              <Image source={{ uri: decryptedFiles[item.fileData.file_id] }} style={styles.imagePreview} />
                            ) : null}
                            <Pressable
                              style={[styles.fileActionButton, isOutgoing && styles.fileActionButtonOutgoing]}
                              onPress={() => handleDownloadFile(item.fileData.file_id, item.fileData.filename)}
                              disabled={downloadingFiles[item.fileData.file_id]}
                            >
                              {downloadingFiles[item.fileData.file_id] ? (
                                <ActivityIndicator size="small" color={isOutgoing ? '#FFFFFF' : colors.textPrimary} />
                              ) : (
                                <Text style={[styles.fileActionText, isOutgoing && styles.fileActionTextOutgoing]}>
                                  {decryptedFiles[item.fileData.file_id] ? 'Open File' : 'Decrypt & Download'}
                                </Text>
                              )}
                            </Pressable>
                          </View>
                        ) : (
                          <Text
                            style={[
                              styles.bubbleText,
                              isOutgoing && styles.bubbleTextOutgoing,
                              isUrl(item.text) && styles.linkText,
                            ]}
                            onPress={isUrl(item.text) ? () => handlePressMessage(item.text) : undefined}
                          >
                            {item.text}
                          </Text>
                        )}
                        <View style={styles.bubbleMeta}>
                          <Text style={[styles.bubbleTime, isOutgoing && styles.bubbleTimeOutgoing]}>{item.time}</Text>
                          {isOutgoing && <DoubleCheckIcon size={12} color={colors.onAccent} />}
                        </View>
                      </View>
                    </View>
                  );
                }}
              />
            )}

            {/* Input Row */}
            <View style={styles.inputRow}>
              <Pressable style={styles.inputIconBtn} hitSlop={8}>
                <SmileIcon size={20} color={colors.textSecondary} />
              </Pressable>
              <Pressable style={styles.inputIconBtn} onPress={handleAttachPress} hitSlop={8}>
                <PaperclipIcon size={20} color={colors.textSecondary} />
              </Pressable>
              <View style={styles.inputPill}>
                <TextInput
                  value={draft}
                  onChangeText={(text) => {
                    setDraft(text);
                    const socket = getSocket();
                    if (socket) {
                      socket.emit('typing', { receiver_id: Number(activeContact.id) });
                    }
                  }}
                  placeholder="Type a secure message..."
                  placeholderTextColor={colors.textTertiary}
                  style={styles.textInput}
                  onSubmitEditing={() => handleSend()}
                />
              </View>
              <Pressable style={styles.inputIconBtn} disabled hitSlop={8}>
                <MicIcon size={20} color={colors.textTertiary} />
              </Pressable>
              <Pressable style={styles.sendButton} onPress={() => handleSend()}>
                <SendIcon size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.emptyContainer}>
            <ShieldIcon size={64} color={colors.border} />
            <Text style={styles.emptyTitle}>Secure LAN Messaging</Text>
            <Text style={styles.emptySubtitle}>Select a contact to begin end-to-end encrypted conversations.</Text>
          </View>
        )}
      </View>

      {/* 3. RIGHT PANEL (Security Panel - Width: 320px) */}
      {activeContact && showSecurityPanel && (
        <View style={styles.rightPanel}>
          <Text style={styles.panelTitle}>Security Panel</Text>

          <ScrollView style={styles.securityInfoScroll}>
            {/* Status cards */}
            <View style={styles.securityMetric}>
              <ShieldCheckIcon size={18} color={colors.online} />
              <View>
                <Text style={styles.metricLabel}>Encryption Status</Text>
                <Text style={styles.metricValue}>RSA-2048 / AES-256 E2EE</Text>
              </View>
            </View>

            <View style={styles.securityMetric}>
              <GlobeIcon size={18} color={colors.online} />
              <View>
                <Text style={styles.metricLabel}>Connection Status</Text>
                <Text style={styles.metricValue}>LAN Connected (Active)</Text>
              </View>
            </View>

            <View style={styles.securityMetric}>
              <ActivityIcon size={18} color={socketConnected ? colors.online : colors.destructive} />
              <View>
                <Text style={styles.metricLabel}>Server Websocket Status</Text>
                <Text style={styles.metricValue}>{socketConnected ? 'Connected (Live)' : 'Disconnected'}</Text>
              </View>
            </View>

            <View style={styles.securityMetric}>
              <KeyIcon size={18} color={recipientPubKey ? colors.online : colors.destructive} />
              <View>
                <Text style={styles.metricLabel}>AES Session Key</Text>
                <Text style={styles.metricValue}>{recipientPubKey ? 'Generated & Verified' : 'Awaiting Exchange'}</Text>
              </View>
            </View>

            <View style={styles.securityMetric}>
              <TimerIcon size={18} color={colors.textSecondary} />
              <View>
                <Text style={styles.metricLabel}>Session Started</Text>
                <Text style={styles.metricValue}>{sessionStartTime}</Text>
              </View>
            </View>

            <View style={styles.fingerprintCard}>
              <Text style={styles.fingerprintTitle}>Verification Fingerprint</Text>
              <Text style={styles.fingerprintValue}>
                {recipientPubKey
                  ? `${recipientPubKey.slice(27, 31)} · ${recipientPubKey.slice(50, 54)} · ${recipientPubKey.slice(99, 103)} · ${recipientPubKey.slice(120, 124)}`
                  : 'N/A'}
              </Text>
              <Text style={styles.fingerprintSub}>Verify this code matches on your contact's device to confirm E2E integrity.</Text>
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: colors.background,
      height: '100%',
    },
    leftPanel: {
      width: 320,
      backgroundColor: colors.screen,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      flexDirection: 'column',
    },
    profileHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 12,
    },
    profileText: {
      flex: 1,
      minWidth: 0,
    },
    profileName: {
      color: colors.textPrimary,
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
    },
    profileStatus: {
      color: colors.textSecondary,
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
    },
    logoutBtn: {
      padding: 6,
    },
    searchSection: {
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sectionTitle: {
      color: colors.textSecondary,
      fontSize: 12.5,
      fontFamily: 'Inter_600SemiBold',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    searchBar: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: 10,
      alignItems: 'center',
      paddingHorizontal: 10,
      height: 38,
    },
    searchInput: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 13.5,
      fontFamily: 'Inter_400Regular',
      padding: 0,
    },
    searchIconBtn: {
      padding: 4,
    },
    errorText: {
      color: colors.destructive,
      fontSize: 11.5,
      marginTop: 4,
    },
    searchResultCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 8,
      padding: 8,
      marginTop: 8,
    },
    resultName: {
      color: colors.textPrimary,
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
    },
    resultEmail: {
      color: colors.textSecondary,
      fontSize: 11,
    },
    addResultBtn: {
      backgroundColor: colors.accent,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 6,
    },
    addResultText: {
      color: '#FFFFFF',
      fontSize: 11.5,
      fontFamily: 'Inter_600SemiBold',
    },
    localSearchWrap: {
      padding: 12,
    },
    localSearchBar: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceAlt,
      borderRadius: 8,
      height: 36,
      alignItems: 'center',
      paddingHorizontal: 10,
      gap: 8,
    },
    localSearchInput: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 13,
      padding: 0,
    },
    contactsList: {
      flex: 1,
    },
    contactCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      marginHorizontal: 8,
      borderRadius: 10,
      marginBottom: 4,
      gap: 12,
    },
    contactCardActive: {
      backgroundColor: colors.accentSoft,
    },
    contactDetails: {
      flex: 1,
      gap: 3,
    },
    contactRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    contactName: {
      color: colors.textPrimary,
      fontSize: 14.5,
      fontFamily: 'Inter_600SemiBold',
    },
    contactTime: {
      color: colors.textTertiary,
      fontSize: 11,
    },
    contactMsg: {
      color: colors.textSecondary,
      fontSize: 12.5,
      flex: 1,
    },
    unreadBadge: {
      backgroundColor: colors.accent,
      borderRadius: 10,
      height: 18,
      minWidth: 18,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 5,
    },
    unreadBadgeText: {
      color: '#FFFFFF',
      fontSize: 10.5,
      fontFamily: 'Inter_700Bold',
    },
    deleteContactBtn: {
      padding: 4,
    },
    profileAvatarContainer: {
      position: 'relative',
    },
    avatarEditOverlayDesktop: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'rgba(0,0,0,0.4)',
      paddingVertical: 1.5,
      borderBottomLeftRadius: 12,
      borderBottomRightRadius: 12,
      alignItems: 'center',
    },
    avatarEditTextDesktop: {
      color: '#FFFFFF',
      fontSize: 8,
      fontFamily: 'Inter_700Bold',
    },
    centerPanel: {
      flex: 1,
      backgroundColor: colors.surfaceAlt,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      flexDirection: 'column',
    },
    chatHeader: {
      height: 64,
      backgroundColor: colors.screen,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      gap: 12,
    },
    chatHeaderText: {
      flex: 1,
    },
    chatHeaderName: {
      color: colors.textPrimary,
      fontSize: 15.5,
      fontFamily: 'Inter_600SemiBold',
    },
    chatHeaderStatus: {
      color: colors.textSecondary,
      fontSize: 12,
    },
    headerBadges: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    encryptionBadge: {
      backgroundColor: 'rgba(34,197,94,0.1)',
      borderWidth: 1,
      borderColor: 'rgba(34,197,94,0.2)',
      borderRadius: 12,
      paddingVertical: 4,
      paddingHorizontal: 10,
    },
    encryptionBadgeText: {
      color: '#22C55E',
      fontSize: 11.5,
      fontFamily: 'Inter_600SemiBold',
    },
    headerIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceAlt,
    },
    headerIconBtnActive: {
      backgroundColor: colors.accentSoft,
    },
    loadingContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    loadingText: {
      color: colors.textSecondary,
      fontSize: 14,
    },
    messageList: {
      paddingHorizontal: 16,
      paddingVertical: 16,
      flexGrow: 1,
    },
    bubbleRow: {
      flexDirection: 'row',
      marginBottom: 12,
      width: '100%',
    },
    bubbleRowOutgoing: {
      justifyContent: 'flex-end',
    },
    bubble: {
      maxWidth: '70%',
      borderRadius: 14,
      padding: 10,
      gap: 4,
    },
    bubbleIncoming: {
      backgroundColor: colors.screen,
      borderBottomLeftRadius: 4,
    },
    bubbleOutgoing: {
      backgroundColor: colors.accent,
      borderBottomRightRadius: 4,
    },
    bubbleText: {
      color: colors.textPrimary,
      fontSize: 14.5,
      lineHeight: 20,
    },
    bubbleTextOutgoing: {
      color: '#FFFFFF',
    },
    linkText: {
      textDecorationLine: 'underline',
      color: '#2F80ED',
    },
    bubbleMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 4,
    },
    bubbleTime: {
      color: colors.textTertiary,
      fontSize: 10,
    },
    bubbleTimeOutgoing: {
      color: 'rgba(255,255,255,0.7)',
    },
    fileContainer: {
      gap: 6,
      minWidth: 160,
    },
    fileTitle: {
      color: colors.textPrimary,
      fontSize: 13.5,
      fontFamily: 'Inter_600SemiBold',
    },
    fileTitleOutgoing: {
      color: '#FFFFFF',
    },
    imagePreview: {
      width: 180,
      height: 120,
      borderRadius: 8,
      resizeMode: 'cover',
    },
    fileActionButton: {
      backgroundColor: colors.surfaceAlt,
      paddingVertical: 6,
      borderRadius: 6,
      alignItems: 'center',
    },
    fileActionButtonOutgoing: {
      backgroundColor: 'rgba(255,255,255,0.2)',
    },
    fileActionText: {
      color: colors.textPrimary,
      fontSize: 11.5,
      fontFamily: 'Inter_600SemiBold',
    },
    fileActionTextOutgoing: {
      color: '#FFFFFF',
    },
    inputRow: {
      height: 64,
      backgroundColor: colors.screen,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      gap: 12,
    },
    inputIconBtn: {
      padding: 6,
    },
    inputPill: {
      flex: 1,
      height: 38,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 19,
      paddingHorizontal: 14,
      justifyContent: 'center',
    },
    textInput: {
      color: colors.textPrimary,
      fontSize: 14,
      padding: 0,
    },
    sendButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      gap: 16,
    },
    emptyTitle: {
      color: colors.textPrimary,
      fontSize: 20,
      fontFamily: 'Inter_700Bold',
    },
    emptySubtitle: {
      color: colors.textSecondary,
      fontSize: 14.5,
      textAlign: 'center',
    },
    rightPanel: {
      width: 320,
      backgroundColor: colors.screen,
      borderLeftWidth: 1,
      borderLeftColor: colors.border,
      padding: 16,
      flexDirection: 'column',
    },
    panelTitle: {
      color: colors.textPrimary,
      fontSize: 16,
      fontFamily: 'Inter_700Bold',
      marginBottom: 16,
    },
    securityInfoScroll: {
      flex: 1,
    },
    securityMetric: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
      backgroundColor: colors.surfaceAlt,
      padding: 12,
      borderRadius: 10,
    },
    metricLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
    },
    metricValue: {
      color: colors.textPrimary,
      fontSize: 13,
      fontFamily: 'Inter_600SemiBold',
    },
    fingerprintCard: {
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder,
      borderRadius: 12,
      padding: 16,
      marginTop: 8,
      gap: 8,
    },
    fingerprintTitle: {
      color: colors.accent,
      fontSize: 13.5,
      fontFamily: 'Inter_600SemiBold',
    },
    fingerprintValue: {
      color: colors.textPrimary,
      fontSize: 12.5,
      fontFamily: 'monospace',
      letterSpacing: 0.5,
    },
    fingerprintSub: {
      color: colors.textSecondary,
      fontSize: 11.5,
      lineHeight: 16,
    },
  });
}


