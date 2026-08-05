import { useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Alert,
  Linking,
  Keyboard,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import * as MediaLibrary from 'expo-media-library';

import ScreenContainer from '../components/ScreenContainer';
import Avatar from '../components/Avatar';
import { Ionicons } from '@expo/vector-icons';
import { ChevronLeftIcon, MoreVerticalIcon, PlusIcon, MicIcon, DoubleCheckIcon } from '../components/icons';
import { useTheme } from '../theme';
import { getSocket, connectSocket } from '../api/socket';
import useSocketListener from '../hooks/useSocketListener';
import { useActiveChat } from '../context/ActiveChatContext';
import { uploadFile, downloadFile, fetchPublicKey, fetchMessages } from '../api/client';
import { hybridEncrypt, hybridDecrypt } from '../crypto/hybrid';
import { useToast } from '../context/ToastContext';
import { Audio } from 'expo-av';

export default function ChatScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const contact = route?.params?.contact ?? { name: 'User', initials: 'U', status: 'offline' };
  const { setActiveChatId } = useActiveChat();
  const { showToast } = useToast();

  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([]);
  const [privateKey, setPrivateKey] = useState(null);
  const [recipientPubKey, setRecipientPubKey] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [contactStatus, setContactStatus] = useState(contact.status ?? 'offline');
  const [inputBarHeight, setInputBarHeight] = useState(80);
  const flatListRef = useRef(null);

  // Audio recording states
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimerRef = useRef(null);

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Denied', 'Microphone permission is required to send voice notes.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      setIsRecording(true);
      setRecordingTime(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      showToast('Recording started...', 'info');
    } catch (err) {
      console.error('Failed to start recording', err);
      showToast('Could not start recording.', 'error');
    }
  };

  const stopRecording = async (shouldSend = true) => {
    if (!recording) return;

    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecording(null);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      if (shouldSend && uri) {
        const filename = `VoiceNote_${Date.now()}.m4a`;
        await processAndUploadFile(uri, filename, 'audio/m4a');
      } else {
        showToast('Recording discarded.', 'info');
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
      showToast('Failed to save recording.', 'error');
    }
  };

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins}:${remainingSecs < 10 ? '0' : ''}${remainingSecs}`;
  };

  const playAudio = async (uri) => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      });
      const { sound } = await Audio.Sound.createAsync({ uri });
      await sound.playAsync();
      showToast('Playing audio...', 'success');
    } catch (e) {
      showToast('Could not play audio.', 'error');
    }
  };

  // Cache decrypted file URIs: fileId -> localUri
  const [decryptedFiles, setDecryptedFiles] = useState({});
  const [downloadingFiles, setDownloadingFiles] = useState({});

  // Mark this chat as active so ContactsScreen suppresses notifications from this contact.
  useEffect(() => {
    setActiveChatId(String(contact.id));
    return () => setActiveChatId(null);
  }, [contact.id, setActiveChatId]);

  // Scroll to bottom when keyboard is shown
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });
    return () => showSub.remove();
  }, []);

  // Load RSA private key
  useEffect(() => {
    connectSocket().catch((err) => console.error('Socket connection failed from ChatScreen', err));

    async function loadKey() {
      const key = await SecureStore.getItemAsync('rsa_private_key');
      setPrivateKey(key);
    }
    loadKey();
  }, []);

  // Load recipient's public key
  useEffect(() => {
    async function loadPubKey() {
      try {
        const key = await fetchPublicKey(contact.id);
        if (key) {
          setRecipientPubKey(key);
        } else {
          setRecipientPubKey(null);
        }
      } catch (e) {
        setRecipientPubKey(null);
      }
    }
    loadPubKey();
  }, [contact.id]);

  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load message history once keys are ready
  useEffect(() => {
    if (!privateKey || !recipientPubKey) return;

    async function loadHistory() {
      setLoadingHistory(true);
      try {
        const clearedAt = await SecureStore.getItemAsync('cleared_at_' + contact.id);
        const history = await fetchMessages(contact.id);
        const decryptedHistory = [];

        for (const msg of history) {
          if (clearedAt && new Date(msg.timestamp) <= new Date(clearedAt)) {
            continue;
          }
          try {
            const decryptedText = await hybridDecrypt(msg, privateKey);
            const isOutgoing = String(msg.sender_id) !== String(contact.id);

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
            console.error('Decryption error for history item:', decryptionError);
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
  }, [privateKey, recipientPubKey, contact.id]);

  // Socket listener for real-time messaging
  useSocketListener({
    onStatusUpdate: ({ user_id, status }) => {
      if (String(user_id) === String(contact.id)) {
        setContactStatus(status);
      }
    },
    onMessage: async (payload) => {
      if (String(payload.sender_id) === String(contact.id)) {
        try {
          const decryptedText = await hybridDecrypt(payload, privateKey);
          let parsedMessage = {
            id: String(payload.message_id || Date.now() + Math.random()),
            type: 'incoming',
            text: decryptedText,
            time: new Date(payload.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
    onTyping: ({ sender_id }) => {
      if (String(sender_id) === String(contact.id)) {
        setIsTyping(true);
        setTimeout(() => setIsTyping(false), 3000);
      }
    },
    onReadReceipt: ({ message_id }) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === String(message_id) ? { ...msg, read: true } : msg))
      );
    },
  });

  const handleSend = async (textToSend = draft) => {
    const trimmed = textToSend.trim();
    if (!trimmed) return;

    if (!recipientPubKey) {
      Alert.alert(
        'Cannot Send Message',
        'This contact has not set up their encryption keys yet. They must log in to the app at least once to generate them.'
      );
      return;
    }

    if (textToSend === draft) {
      setDraft('');
    }

    try {
      // 1. Encrypt message using hybrid encryption
      const encrypted = hybridEncrypt(trimmed, recipientPubKey);

      // 2. Emit over socket
      const socket = getSocket();
      let msgId = String(Date.now() + Math.random());
      if (socket) {
        socket.emit('message', {
          receiver_id: Number(contact.id),
          ...encrypted,
        });
      }

      // 3. Append to local state
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
    } catch (e) {
      console.error('Encryption or send failed', e);
      Alert.alert('Error', 'Failed to encrypt or send message.');
    }
  };

  // Broadcast typing status
  const handleTypingInput = (text) => {
    setDraft(text);
    const socket = getSocket();
    if (socket) {
      socket.emit('typing', { receiver_id: Number(contact.id) });
    }
  };

  // Attachment Handler (Menu options)
  const handleAttachPress = () => {
    Alert.alert(
      'Send Attachment',
      'Select the type of attachment to send:',
      [
        { text: 'Photo / Image', onPress: sendPhotoAttachment },
        { text: 'Document (PDF, Word, Excel...)', onPress: sendDocumentAttachment },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const processAndUploadFile = async (uri, filename, mimeType) => {
    const cleanFilename = decodeURIComponent(filename);
    if (!recipientPubKey) {
      Alert.alert('Error', 'Recipient public key not loaded yet.');
      return;
    }
    // Check file size (5MB limit)
    if (Platform.OS !== 'web') {
      try {
        const fileInfo = await FileSystem.getInfoAsync(uri);
        const MAX_FILE_SIZE = 5 * 1024 * 1024;
        if (fileInfo.exists && fileInfo.size > MAX_FILE_SIZE) {
          Alert.alert('File Too Large', 'The file size exceeds the 5MB limit. Please select a smaller file.');
          return;
        }
      } catch (sizeErr) {
        console.warn('Could not check file size:', sizeErr);
      }
    }

    setFileUploading(true);
    try {
      // 1. Read file as Base64 string
      let fileBytes;
      if (Platform.OS === 'web') {
        const response = await fetch(uri);
        const blob = await response.blob();
        fileBytes = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result.split(',')[1];
            resolve(base64data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        fileBytes = await FileSystem.readAsStringAsync(uri, {
          encoding: 'base64',
        });
      }

      // 2. Encrypt file Base64 content using hybrid encryption
      const encryptedFile = hybridEncrypt(fileBytes, recipientPubKey);

      // 3. Write/format encrypted data for upload
      let fileUri;
      if (Platform.OS === 'web') {
        fileUri = `data:application/octet-stream;base64,${encryptedFile.ciphertext}`;
      } else {
        const tempPath = `${FileSystem.cacheDirectory}temp_upload_${Date.now()}.enc`;
        await FileSystem.writeAsStringAsync(tempPath, encryptedFile.ciphertext, {
          encoding: 'base64',
        });
        fileUri = tempPath;
      }

      // 4. Upload encrypted file to backend
      const uploadResult = await uploadFile({
        receiverId: Number(contact.id),
        encryptedAesKey: encryptedFile.encrypted_aes_key,
        iv: encryptedFile.iv,
        tag: encryptedFile.tag,
        fileUri,
        fileName: cleanFilename,
      });

      // 5. Send file metadata to recipient
      const fileMessage = {
        type: 'file',
        file_id: uploadResult.file_id,
        filename: cleanFilename,
        mimeType: mimeType || 'application/octet-stream',
      };

      await handleSend(JSON.stringify(fileMessage));

      // Cleanup temp local file on native platforms
      if (Platform.OS !== 'web') {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      }
    } catch (e) {
      console.error('File upload failed', e);
      Alert.alert('Upload Error', 'Could not encrypt or send file.');
    } finally {
      setFileUploading(false);
    }
  };

  const sendPhotoAttachment = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Denied', 'Media library access is required.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      const filename = asset.fileName || `image_${Date.now()}.png`;
      await processAndUploadFile(asset.uri, filename, 'image/png');
    }
  };

  const sendDocumentAttachment = async () => {
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
      console.error('Document picker error', e);
    }
  };

  // Download and Decrypt File
  const handleDownloadFile = async (fileId, filename) => {
    const cleanFilename = decodeURIComponent(filename);
    const isAudio = cleanFilename.toLowerCase().endsWith('.m4a') || cleanFilename.toLowerCase().endsWith('.mp3');

    if (decryptedFiles[fileId]) {
      if (isAudio) {
        playAudio(decryptedFiles[fileId]);
        return;
      }
      // Already downloaded, let's open/share it
      if (Platform.OS === 'web') {
        window.open(decryptedFiles[fileId], '_blank');
      } else {
        await Sharing.shareAsync(decryptedFiles[fileId]);
      }
      return;
    }

    setDownloadingFiles((prev) => ({ ...prev, [fileId]: true }));
    try {
      // 1. Fetch file payload from backend
      const encryptedFileData = await downloadFile(fileId);

      // 2. Decrypt file Base64 payload on-device
      const decryptedBase64 = await hybridDecrypt(encryptedFileData, privateKey);

      if (Platform.OS === 'web') {
        const blob = await fetch(`data:application/octet-stream;base64,${decryptedBase64}`).then(r => r.blob());
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = cleanFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setDecryptedFiles((prev) => ({ ...prev, [fileId]: url }));
      } else {
        // 3. Save decrypted file to local storage
        const localPath = `${FileSystem.documentDirectory}${cleanFilename}`;
        await FileSystem.writeAsStringAsync(localPath, decryptedBase64, {
          encoding: 'base64',
        });

        setDecryptedFiles((prev) => ({ ...prev, [fileId]: localPath }));

        // 4. Handle Media (Images & Videos) directly to gallery
        if (isMedia(cleanFilename)) {
          try {
            const permission = await MediaLibrary.requestPermissionsAsync();
            if (permission.granted) {
              await MediaLibrary.saveToLibraryAsync(localPath);
              showToast('Saved to gallery!', 'success');
            } else {
              showToast('Gallery permission required to save.', 'error');
            }
          } catch (mediaErr) {
            console.warn('Could not save to gallery:', mediaErr);
          }
        } else if (isAudio) {
          playAudio(localPath);
        } else {
          // 5. General files - prompt for file system save
          Alert.alert(
            'File Decrypted',
            `Saved locally as ${cleanFilename}. What would you like to do?`,
            [
              { text: 'Save to Files / Share', onPress: () => Sharing.shareAsync(localPath) },
              { text: 'Cancel', style: 'cancel' }
            ]
          );
        }
      }
    } catch (e) {
      console.error('File download/decryption failed', e);
      Alert.alert('Download Error', 'Could not decrypt or download this file.');
    } finally {
      setDownloadingFiles((prev) => ({ ...prev, [fileId]: false }));
    }
  };

  const isMedia = (filename) => {
    const ext = filename?.toLowerCase() || '';
    return (
      ext.endsWith('.png') ||
      ext.endsWith('.jpg') ||
      ext.endsWith('.jpeg') ||
      ext.endsWith('.gif') ||
      ext.endsWith('.webp') ||
      ext.endsWith('.mp4') ||
      ext.endsWith('.mov') ||
      ext.endsWith('.m4v') ||
      ext.endsWith('.3gp') ||
      ext.endsWith('.avi')
    );
  };

  const isImage = (filename) => {
    const ext = filename?.toLowerCase() || '';
    return ext.endsWith('.png') || ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.gif') || ext.endsWith('.webp');
  };

  const isUrl = (text) => {
    if (typeof text !== 'string') return false;
    const pattern = new RegExp('^(https?:\\/\\/)?'+ // protocol
      '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|'+ // domain name
      '((\\d{1,3}\\.){3}\\d{1,3}))'+ // OR ip (v4) address
      '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*'+ // port and path
      '(\\?[;&a-z\\d%_.~+=-]*)?'+ // query string
      '(\\#[-a-z\\d_]*)?$','i'); // fragment locator
    return !!pattern.test(text);
  };

  const handlePressMessage = (text) => {
    if (isUrl(text)) {
      let url = text;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      Linking.openURL(url).catch((err) => console.error("Failed to open URL", err));
    }
  };

  const handleMorePress = () => {
    Alert.alert(
      'Conversation Options',
      'Select an action:',
      [
        { text: 'Erase Conversation', style: 'destructive', onPress: confirmEraseConversation },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const confirmEraseConversation = async () => {
    try {
      const now = new Date().toISOString();
      await SecureStore.setItemAsync('cleared_at_' + contact.id, now);
      setMessages([]);
      Alert.alert('Erased', 'The conversation has been erased completely.');
    } catch (e) {
      console.error('Failed to erase conversation', e);
    }
  };

  return (
    <ScreenContainer style={{ backgroundColor: colors.screen }}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <ChevronLeftIcon color={colors.textSecondary} />
        </Pressable>
        <Avatar initials={contact.initials} size={38} />
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{contact.name}</Text>
          <Text style={[styles.headerStatus, contactStatus !== 'online' && styles.headerStatusOffline]}>
            {contactStatus === 'online' ? 'Online' : 'Offline'}
          </Text>
        </View>
        <Pressable onPress={handleMorePress} hitSlop={8}>
          <MoreVerticalIcon color={colors.textSecondary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {loadingHistory ? (
          <View style={styles.historyLoader}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.historyLoaderText}>Loading encrypted history…</Text>
          </View>
        ) : null}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          style={styles.messageListOuter}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const isOutgoing = item.type === 'outgoing';
            const hasFile = !!item.fileData;

            return (
              <View style={[styles.bubbleWrap, isOutgoing && styles.bubbleWrapOutgoing]}>
                <View style={[styles.bubble, isOutgoing ? styles.bubbleOutgoing : styles.bubbleIncoming]}>
                  {hasFile ? (
                    <View style={styles.fileContainer}>
                      <Text style={[styles.fileTitle, isOutgoing && styles.fileTitleOutgoing]}>
                        📎 {item.fileData.filename}
                      </Text>
                      {isImage(item.fileData.filename) && decryptedFiles[item.fileData.file_id] ? (
                        <Image
                          source={{ uri: decryptedFiles[item.fileData.file_id] }}
                          style={styles.imagePreview}
                        />
                      ) : null}
                      <Pressable
                        style={[styles.fileActionButton, isOutgoing && styles.fileActionButtonOutgoing]}
                        onPress={() => handleDownloadFile(item.fileData.file_id, item.fileData.filename)}
                        disabled={downloadingFiles[item.fileData.file_id]}
                      >
                        {downloadingFiles[item.fileData.file_id] ? (
                          <ActivityIndicator size="small" color={isOutgoing ? colors.accent : colors.textPrimary} />
                        ) : (
                          <Text style={[styles.fileActionText, isOutgoing && styles.fileActionTextOutgoing]}>
                            {decryptedFiles[item.fileData.file_id] ? 'Open / Share' : 'Download & Decrypt'}
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  ) : (
                    <Text 
                      style={[styles.bubbleText, isOutgoing && styles.bubbleTextOutgoing, isUrl(item.text) && styles.linkText]}
                      onPress={isUrl(item.text) ? () => handlePressMessage(item.text) : undefined}
                    >
                      {item.text}
                    </Text>
                  )}
                </View>
                <View style={[styles.meta, isOutgoing && styles.metaOutgoing]}>
                  <Text style={styles.metaTime}>{item.time}</Text>
                  {isOutgoing && item.read ? <DoubleCheckIcon color={colors.accent} /> : null}
                </View>
              </View>
            );
          }}
        />

        {isTyping && <Text style={styles.typing}>{contact.name.split(' ')[0]} is typing…</Text>}

        {fileUploading && (
          <View style={styles.uploadingLoader}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.uploadingText}>Encrypting &amp; uploading file…</Text>
          </View>
        )}

        {/* Floating input */}
        <View style={styles.inputBar} onLayout={(e) => setInputBarHeight(e.nativeEvent.layout.height)}>
          {isRecording ? (
            <View style={styles.inputRow}>
              <Pressable style={styles.cancelRecBtn} onPress={() => stopRecording(false)} hitSlop={8}>
                <Ionicons name="trash-outline" size={22} color={colors.destructive} />
              </Pressable>

              <View style={[styles.inputPill, { justifyContent: 'center' }]}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingTimeText}>
                  Recording: {formatTime(recordingTime)}
                </Text>
              </View>

              <Pressable style={styles.sendButton} onPress={() => stopRecording(true)} hitSlop={8}>
                <Ionicons name="send" size={18} color={colors.onAccent} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.inputRow}>
              <Pressable style={styles.attachButton} onPress={handleAttachPress} hitSlop={8}>
                <PlusIcon size={22} color={colors.textPrimary} />
              </Pressable>

              <View style={styles.inputPill}>
                <TextInput
                  value={draft}
                  onChangeText={handleTypingInput}
                  placeholder="Message"
                  placeholderTextColor={colors.textTertiary}
                  style={styles.input}
                  multiline
                  scrollEnabled
                  textAlignVertical="center"
                />
                {!draft && (
                  <Pressable onPress={startRecording} hitSlop={8}>
                    <MicIcon size={20} color={colors.textTertiary} />
                  </Pressable>
                )}
              </View>

              <Pressable style={styles.sendButton} onPress={() => handleSend()} hitSlop={8}>
                <Ionicons name="send" size={18} color={colors.onAccent} />
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      {fileUploading && (
        <View style={StyleSheet.absoluteFill}>
          <View style={styles.uploadingOverlay}>
            <View style={styles.uploadingModal}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.uploadingTextText}>Encrypting &amp; Uploading File...</Text>
            </View>
          </View>
        </View>
      )}
    </ScreenContainer>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: colors.screen },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: colors.screen,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerInfo: {
      flex: 1,
    },
    headerName: {
      color: colors.textPrimary,
      fontSize: 16,
      fontFamily: 'Inter_600SemiBold',
    },
    headerStatus: {
      color: colors.online,
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
    },
    headerStatusOffline: {
      color: colors.textTertiary,
    },
    messageListOuter: {
      flex: 1,
      backgroundColor: colors.screen,
    },
    messageList: {
      gap: 14,
      padding: 16,
      flexGrow: 1,
      backgroundColor: colors.screen,
    },
    bubbleWrap: {
      alignSelf: 'flex-start',
      maxWidth: '75%',
      gap: 4,
      marginBottom: 10,
    },
    bubbleWrapOutgoing: {
      alignSelf: 'flex-end',
      alignItems: 'flex-end',
    },
    bubble: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.02,
      shadowRadius: 3,
      elevation: 1,
    },
    bubbleIncoming: {
      backgroundColor: colors.screen,
      borderRadius: 16,
      borderBottomLeftRadius: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bubbleOutgoing: {
      backgroundColor: colors.accent,
      borderRadius: 16,
      borderBottomRightRadius: 4,
    },
    bubbleText: {
      color: colors.textPrimary,
      fontSize: 15,
      lineHeight: 21,
      fontFamily: 'Inter_400Regular',
    },
    bubbleTextOutgoing: {
      color: '#FFFFFF',
      fontFamily: 'Inter_400Regular',
    },
    linkText: {
      textDecorationLine: 'underline',
      color: '#0A84FF',
    },
    fileContainer: {
      gap: 8,
      minWidth: 160,
    },
    fileTitle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
    },
    fileTitleOutgoing: {
      color: '#FFFFFF',
    },
    imagePreview: {
      width: 180,
      height: 120,
      borderRadius: 10,
      resizeMode: 'cover',
    },
    fileActionButton: {
      backgroundColor: colors.screen,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      alignItems: 'center',
    },
    fileActionButtonOutgoing: {
      backgroundColor: 'rgba(255,255,255,0.2)',
    },
    fileActionText: {
      color: colors.textPrimary,
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
    },
    fileActionTextOutgoing: {
      color: '#FFFFFF',
    },
    meta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingLeft: 4,
      marginTop: 2,
    },
    metaOutgoing: {
      paddingLeft: 0,
      paddingRight: 4,
    },
    metaTime: {
      color: colors.textTertiary,
      fontSize: 11,
      fontFamily: 'Inter_400Regular',
    },
    typing: {
      color: colors.textTertiary,
      fontSize: 12.5,
      fontStyle: 'italic',
      paddingHorizontal: 20,
      paddingBottom: 8,
      backgroundColor: colors.screen,
    },
    uploadingLoader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 20,
      paddingBottom: 8,
      backgroundColor: colors.screen,
    },
    uploadingText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
    },
    uploadingOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    uploadingModal: {
      backgroundColor: colors.screen,
      borderRadius: 16,
      padding: 24,
      alignItems: 'center',
      gap: 16,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 6,
    },
    uploadingTextText: {
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
      color: colors.textPrimary,
    },
    recordingDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.destructive,
      marginRight: 8,
    },
    recordingTimeText: {
      fontSize: 15,
      fontFamily: 'Inter_600SemiBold',
      color: colors.textPrimary,
    },
    cancelRecBtn: {
      width: 36,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inputBar: {
      backgroundColor: colors.screen,
      paddingHorizontal: 10,
      paddingTop: 6,
      paddingBottom: 16,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    attachButton: {
      width: 36,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inputPill: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      borderRadius: 24,
      backgroundColor: colors.chatInputBg,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      gap: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    input: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 15,
      fontFamily: 'Inter_400Regular',
      paddingVertical: 11,
      maxHeight: 100,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.35,
      shadowRadius: 6,
      elevation: 4,
    },
    historyLoader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      backgroundColor: colors.screen,
    },
    historyLoaderText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
    },
  });
}
