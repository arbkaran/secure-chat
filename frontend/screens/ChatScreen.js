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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import * as MediaLibrary from 'expo-media-library';

import ScreenContainer from '../components/ScreenContainer';
import Avatar from '../components/Avatar';
import {
  ChevronLeftIcon,
  MoreVerticalIcon,
  PaperclipIcon,
  SendIcon,
  DoubleCheckIcon,
  CameraIcon,
  MicIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
} from '../components/icons';
import { useTheme } from '../theme';
import { getSocket, connectSocket } from '../api/socket';
import useSocketListener from '../hooks/useSocketListener';
import { uploadFile, downloadFile, fetchPublicKey, fetchMessages } from '../api/client';
import { hybridEncrypt, hybridDecrypt } from '../crypto/hybrid';
import { Audio } from 'expo-av';

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
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [playingAudioId, setPlayingAudioId] = useState(null);
  const soundRef = useRef(null);
  const flatListRef = useRef(null);

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

  // Recording timer effect
  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  // Clean up recording object on unmount
  useEffect(() => {
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {});
      }
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
      }
    };
  }, [recording]);

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
    if (!privateKey) return;

    async function loadHistory() {
      setLoadingHistory(true);
      try {
        const currentUserId = await SecureStore.getItemAsync('user_id');
        const clearedRaw = await SecureStore.getItemAsync('cleared_chats_map');
        const clearedMap = clearedRaw ? JSON.parse(clearedRaw) : {};
        const clearedAt = clearedMap[`${currentUserId}_${contact.id}`];
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
            console.warn('Decryption error for history item:', decryptionError.message);
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
  }, [privateKey, contact.id]);

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

    let activePubKey = recipientPubKey;
    if (!activePubKey) {
      try {
        activePubKey = await fetchPublicKey(contact.id);
        setRecipientPubKey(activePubKey);
      } catch (e) {
        // Still not found or error fetching
      }
    }

    if (!activePubKey) {
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
      const encrypted = hybridEncrypt(trimmed, activePubKey);

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
        { text: 'Take Photo (Camera)', onPress: takePhotoAttachment },
        { text: 'Photo Library', onPress: sendPhotoAttachment },
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

    setFileUploading(true);
    try {
      // 1. Read file as Base64 string
      const fileBytes = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });

      // 2. Encrypt file Base64 content using hybrid encryption
      const encryptedFile = hybridEncrypt(fileBytes, recipientPubKey);

      // 3. Write encrypted data to a temporary file locally so we can upload it
      const tempPath = `${FileSystem.cacheDirectory}temp_upload_${Date.now()}.enc`;
      await FileSystem.writeAsStringAsync(tempPath, encryptedFile.ciphertext, {
        encoding: 'base64',
      });

      // 4. Upload encrypted file to backend
      const uploadResult = await uploadFile({
        receiverId: Number(contact.id),
        encryptedAesKey: encryptedFile.encrypted_aes_key,
        iv: encryptedFile.iv,
        tag: encryptedFile.tag,
        fileUri: tempPath,
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

  const takePhotoAttachment = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Denied', 'Camera access is required.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      const filename = asset.fileName || `camera_${Date.now()}.png`;
      await processAndUploadFile(asset.uri, filename, 'image/png');
    }
  };

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Denied', 'Microphone access is required to record audio.');
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
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Failed to start voice recording.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setIsRecording(false);
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
      const uri = recording.getURI();
      setRecording(null);

      if (uri) {
        const filename = `voice_note_${Date.now()}.m4a`;
        await processAndUploadFile(uri, filename, 'audio/m4a');
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
      Alert.alert('Error', 'Failed to save voice recording.');
    }
  };

  const handlePlayPauseAudio = async (fileId, filename) => {
    if (playingAudioId === fileId) {
      if (soundRef.current) {
        await soundRef.current.pauseAsync();
        setPlayingAudioId(null);
      }
      return;
    }

    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (err) {
        console.warn('Unloading previous sound failed', err);
      }
      soundRef.current = null;
      setPlayingAudioId(null);
    }

    let filePath = decryptedFiles[fileId];

    if (!filePath) {
      const cleanFilename = decodeURIComponent(filename);
      const sanitizedFilename = cleanFilename.replace(/\s+/g, '_');
      setDownloadingFiles((prev) => ({ ...prev, [fileId]: true }));
      try {
        const encryptedFileData = await downloadFile(fileId);
        const decryptedBase64 = await hybridDecrypt(encryptedFileData, privateKey);
        filePath = `${FileSystem.documentDirectory}${sanitizedFilename}`;
        await FileSystem.writeAsStringAsync(filePath, decryptedBase64, {
          encoding: 'base64',
        });
        setDecryptedFiles((prev) => ({ ...prev, [fileId]: filePath }));
      } catch (e) {
        console.error('File download/decryption failed for playback', e);
        Alert.alert('Download Error', 'Could not decrypt and play this voice note.');
        setDownloadingFiles((prev) => ({ ...prev, [fileId]: false }));
        return;
      } finally {
        setDownloadingFiles((prev) => ({ ...prev, [fileId]: false }));
      }
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: filePath },
        { shouldPlay: true },
        async (status) => {
          if (status.didJustFinish) {
            setPlayingAudioId(null);
            if (soundRef.current) {
              await soundRef.current.unloadAsync();
              soundRef.current = null;
            }
          }
        }
      );

      soundRef.current = sound;
      setPlayingAudioId(fileId);
    } catch (err) {
      console.error('Failed to play audio', err);
      Alert.alert('Playback Error', 'Failed to play audio file.');
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
    const sanitizedFilename = cleanFilename.replace(/\s+/g, '_');
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
      const localPath = `${FileSystem.documentDirectory}${sanitizedFilename}`;
      await FileSystem.writeAsStringAsync(localPath, decryptedBase64, {
        encoding: 'base64',
      });

      setDecryptedFiles((prev) => ({ ...prev, [fileId]: localPath }));

      // 4. Save to gallery if it is an image
      if (isImage(cleanFilename)) {
        try {
          const permission = await MediaLibrary.requestPermissionsAsync();
          if (permission.granted) {
            await MediaLibrary.saveToLibraryAsync(localPath);
            Alert.alert('Saved to Gallery', 'This photo was successfully saved to your gallery.');
          }
        } catch (mediaErr) {
          console.warn('Could not save to gallery:', mediaErr);
        }
      }

      // 5. Share/Open file
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
      const currentUserId = await SecureStore.getItemAsync('user_id');
      const clearedRaw = await SecureStore.getItemAsync('cleared_chats_map');
      const clearedMap = clearedRaw ? JSON.parse(clearedRaw) : {};
      clearedMap[`${currentUserId}_${contact.id}`] = now;
      await SecureStore.setItemAsync('cleared_chats_map', JSON.stringify(clearedMap));
      setMessages([]);
      Alert.alert('Erased', 'The conversation has been erased completely.');
    } catch (e) {
      console.error('Failed to erase conversation', e);
    }
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
        <Pressable onPress={handleMorePress} hitSlop={8}>
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
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const isOutgoing = item.type === 'outgoing';
            const hasFile = !!item.fileData;
            const isAudioFile = hasFile && (item.fileData.mimeType?.startsWith('audio/') || item.fileData.filename?.endsWith('.m4a'));

            return (
              <View style={[styles.bubbleWrap, isOutgoing && styles.bubbleWrapOutgoing]}>
                <View style={[styles.bubble, isOutgoing ? styles.bubbleOutgoing : styles.bubbleIncoming]}>
                  {hasFile ? (
                    isAudioFile ? (
                      <View style={styles.audioContainer}>
                        <Pressable
                          style={[styles.audioPlayButton, isOutgoing && styles.audioPlayButtonOutgoing]}
                          onPress={() => handlePlayPauseAudio(item.fileData.file_id, item.fileData.filename)}
                          disabled={downloadingFiles[item.fileData.file_id]}
                        >
                          {downloadingFiles[item.fileData.file_id] ? (
                            <ActivityIndicator size="small" color={isOutgoing ? '#FFFFFF' : colors.accent} />
                          ) : (
                            playingAudioId === item.fileData.file_id ? (
                              <PauseIcon size={16} color={isOutgoing ? colors.accent : colors.textPrimary} />
                            ) : (
                              <PlayIcon size={16} color={isOutgoing ? colors.accent : colors.textPrimary} />
                            )
                          )}
                        </Pressable>
                        <View style={styles.audioInfo}>
                          <Text style={[styles.audioTitle, isOutgoing && styles.audioTitleOutgoing]}>
                            Voice Note
                          </Text>
                          <Text style={[styles.audioSubtitle, isOutgoing && styles.audioSubtitleOutgoing]}>
                            {playingAudioId === item.fileData.file_id ? 'Playing…' : 'Tap to listen'}
                          </Text>
                        </View>
                      </View>
                    ) : (
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
                    )
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

        {isTyping && <Text style={styles.typing}>{(contact.name || '').split(' ')[0] || 'Someone'} is typing…</Text>}

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
          
          {isRecording ? (
            <View style={styles.recordingContainer}>
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>
                  Recording ({Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')})
                </Text>
              </View>
              <Pressable style={styles.cancelRecordingButton} onPress={() => {
                setIsRecording(false);
                if (recording) {
                  recording.stopAndUnloadAsync().catch(() => {});
                  setRecording(null);
                }
              }}>
                <Text style={styles.cancelRecordingText}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
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
          )}

          {isRecording ? (
            <Pressable style={[styles.sendButton, { backgroundColor: colors.destructive }]} onPress={stopRecording} hitSlop={8}>
              <StopIcon color="#FFFFFF" size={16} />
            </Pressable>
          ) : (
            draft.trim() ? (
              <Pressable style={styles.sendButton} onPress={() => handleSend()} hitSlop={8}>
                <SendIcon color={colors.onAccent} />
              </Pressable>
            ) : (
              <Pressable style={styles.attachButton} onPress={startRecording} hitSlop={8}>
                <MicIcon color={colors.textSecondary} size={20} />
              </Pressable>
            )
          )}
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
    messageList: {
      gap: 14,
      padding: 16,
      backgroundColor: colors.surfaceAlt,
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
      backgroundColor: colors.surfaceAlt,
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
      backgroundColor: colors.surfaceAlt,
    },
    uploadingLoader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 20,
      paddingBottom: 8,
      backgroundColor: colors.surfaceAlt,
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
      paddingBottom: 24,
      backgroundColor: colors.screen,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    attachButton: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inputPill: {
      flex: 1,
      minHeight: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceAlt,
      justifyContent: 'center',
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    input: {
      color: colors.textPrimary,
      fontSize: 14.5,
      fontFamily: 'Inter_400Regular',
      paddingVertical: Platform.OS === 'ios' ? 8 : 4,
      maxHeight: 100,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    historyLoader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      backgroundColor: colors.surfaceAlt,
    },
    historyLoaderText: {
      color: colors.textSecondary,
      fontSize: 13,
      fontFamily: 'Inter_400Regular',
    },
    audioContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minWidth: 180,
      paddingVertical: 4,
    },
    audioPlayButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    audioPlayButtonOutgoing: {
      backgroundColor: 'rgba(255, 255, 255, 0.25)',
    },
    audioInfo: {
      flex: 1,
      justifyContent: 'center',
    },
    audioTitle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
    },
    audioTitleOutgoing: {
      color: '#FFFFFF',
    },
    audioSubtitle: {
      color: colors.textSecondary,
      fontSize: 12,
      fontFamily: 'Inter_400Regular',
      marginTop: 2,
    },
    audioSubtitleOutgoing: {
      color: 'rgba(255, 255, 255, 0.7)',
    },
    recordingContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceAlt,
      height: 40,
      borderRadius: 20,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    recordingIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    recordingDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#EF4444',
    },
    recordingText: {
      color: colors.textPrimary,
      fontSize: 14,
      fontFamily: 'Inter_500Medium',
    },
    cancelRecordingButton: {
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    cancelRecordingText: {
      color: colors.destructive,
      fontSize: 14,
      fontFamily: 'Inter_600SemiBold',
    },
  });
}

