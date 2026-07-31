import { useEffect, useMemo, useState } from 'react';
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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

import ScreenContainer from '../components/ScreenContainer';
import Avatar from '../components/Avatar';
import { ChevronLeftIcon, MoreVerticalIcon, PaperclipIcon, SendIcon, DoubleCheckIcon } from '../components/icons';
import { useTheme } from '../theme';
import { getSocket, connectSocket } from '../api/socket';
import useSocketListener from '../hooks/useSocketListener';
import { uploadFile, downloadFile, fetchPublicKey, fetchMessages } from '../api/client';
import { hybridEncrypt, hybridDecrypt } from '../crypto/hybrid';

export default function ChatScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const contact = route?.params?.contact ?? { name: 'User', initials: 'U', status: 'offline' };

  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([]);
  const [privateKey, setPrivateKey] = useState(null);
  const [recipientPubKey, setRecipientPubKey] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);

  // Cache decrypted file URIs: fileId -> localUri
  const [decryptedFiles, setDecryptedFiles] = useState({});
  const [downloadingFiles, setDownloadingFiles] = useState({});

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
        setRecipientPubKey(key);
      } catch (e) {
        console.error('Failed to load recipient public key', e);
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
        const history = await fetchMessages(contact.id);
        const decryptedHistory = [];

        for (const msg of history) {
          try {
            const decryptedText = await hybridDecrypt(msg, privateKey);
            const isOutgoing = String(msg.sender_id) !== String(contact.id);

            let parsedMsg = {
              id: String(msg.message_id),
              type: isOutgoing ? 'outgoing' : 'incoming',
              text: decryptedText,
              time: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
            const isOutgoing = String(msg.sender_id) !== String(contact.id);
            decryptedHistory.push({
              id: String(msg.message_id),
              type: isOutgoing ? 'outgoing' : 'incoming',
              text: '🔒 [Decryption Failed]',
              time: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
    if (!recipientPubKey) {
      Alert.alert('Error', 'Recipient public key not loaded yet.');
      return;
    }
    setFileUploading(true);
    try {
      // 1. Read file as Base64 string
      const fileBytes = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });

      // 2. Encrypt file Base64 content using hybrid encryption
      const encryptedFile = hybridEncrypt(fileBytes, recipientPubKey);

      // 3. Write encrypted data to a temporary file locally so we can upload it
      const tempPath = `${FileSystem.cacheDirectory}${filename}.enc`;
      await FileSystem.writeAsStringAsync(tempPath, encryptedFile.ciphertext, {
        encoding: 'utf8',
      });

      // 4. Upload encrypted file to backend
      const uploadResult = await uploadFile({
        receiverId: Number(contact.id),
        encryptedAesKey: encryptedFile.encrypted_aes_key,
        iv: encryptedFile.iv,
        tag: encryptedFile.tag,
        fileUri: tempPath,
        fileName: filename,
      });

      // 5. Send file metadata to recipient
      const fileMessage = {
        type: 'file',
        file_id: uploadResult.file_id,
        filename: filename,
        mimeType: mimeType || 'application/octet-stream',
      };

      await handleSend(JSON.stringify(fileMessage));

      // Cleanup temp local file
      await FileSystem.deleteAsync(tempPath, { idempotent: true });
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
    if (decryptedFiles[fileId]) {
      // Already downloaded, let's open it
      await Sharing.shareAsync(decryptedFiles[fileId]);
      return;
    }

    setDownloadingFiles((prev) => ({ ...prev, [fileId]: true }));
    try {
      // 1. Fetch file payload from backend
      const encryptedFileData = await downloadFile(fileId);

      // 2. Decrypt file Base64 payload on-device
      const decryptedBase64 = await hybridDecrypt(encryptedFileData, privateKey);

      // 3. Save decrypted file to local storage
      const localPath = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(localPath, decryptedBase64, {
        encoding: 'base64',
      });

      setDecryptedFiles((prev) => ({ ...prev, [fileId]: localPath }));

      // 4. Share/Open file
      await Sharing.shareAsync(localPath);
    } catch (e) {
      console.error('File download/decryption failed', e);
      Alert.alert('Download Error', 'Could not decrypt or download this file.');
    } finally {
      setDownloadingFiles((prev) => ({ ...prev, [fileId]: false }));
    }
  };

  const isImage = (filename) => {
    const ext = filename?.toLowerCase() || '';
    return ext.endsWith('.png') || ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.gif') || ext.endsWith('.webp');
  };

  const isUrl = (text) => {
    const pattern = new RegExp('^(https?:\\/\\/)?'+ // protocol
      '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|'+ // domain name
      '((\\d{1,3}\\.){3}\\d{1,3}))'+ // OR ip (v4) address
      '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*'+ // port and path
      '(\\?[;&a-z\\d%_.~+=-]*)?'+ // query string
      '(\\#[-a-z\\d_]*)?$','i'); // fragment locator
    return !!pattern.test(text);
  };

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
        {loadingHistory ? (
          <View style={styles.historyLoader}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.historyLoaderText}>Loading encrypted history…</Text>
          </View>
        ) : null}
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
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
                    <Text style={[styles.bubbleText, isOutgoing && styles.bubbleTextOutgoing, isUrl(item.text) && styles.linkText]}>
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

        <View style={styles.inputRow}>
          <Pressable style={styles.attachButton} onPress={handleAttachPress} hitSlop={8}>
            <PaperclipIcon color={colors.textSecondary} />
          </Pressable>
          <View style={styles.inputPill}>
            <TextInput
              value={draft}
              onChangeText={handleTypingInput}
              placeholder="Message"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
              multiline
            />
          </View>
          <Pressable style={styles.sendButton} onPress={() => handleSend()} hitSlop={8}>
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
    linkText: {
      textDecorationLine: 'underline',
      color: '#2F80ED',
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
      color: colors.onAccent,
    },
    imagePreview: {
      width: 150,
      height: 150,
      borderRadius: 10,
      resizeMode: 'cover',
    },
    fileActionButton: {
      backgroundColor: colors.surface,
      paddingVertical: 6,
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
      color: colors.onAccent,
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
    uploadingLoader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    uploadingText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
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
    historyLoader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 10,
      backgroundColor: colors.surface,
    },
    historyLoaderText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
    },
  });
}
