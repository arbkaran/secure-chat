import axios from 'axios';
import { Platform } from 'react-native';
import { API_BASE_URL } from '../config/env';
import { getAccessToken, setSession, clearSession } from './authStorage';

const client = axios.create({ baseURL: API_BASE_URL, timeout: 15000 });

client.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default client;

export async function register({ name, email, password }) {
  const { data } = await client.post('/auth/register', { name, email, password });
  return data;
}

export async function verifyOtp({ email, code }) {
  const { data } = await client.post('/auth/verify-otp', { email, code });
  return data;
}

export async function login({ email, password }) {
  const { data } = await client.post('/auth/login', { email, password });
  await setSession(data.access_token, data.user_id);
  return data;
}

export async function logout() {
  await clearSession();
}

export async function uploadPublicKey(publicKey) {
  const { data } = await client.put('/keys/upload', { public_key: publicKey });
  return data;
}

export async function fetchPublicKey(userId) {
  const { data } = await client.get(`/keys/${userId}`);
  return data.rsa_public_key ?? data.public_key;
}

export async function uploadFile({ receiverId, encryptedAesKey, iv, tag, fileUri, fileName = 'encrypted.bin' }) {
  const form = new FormData();
  form.append('receiver_id', String(receiverId));
  form.append('encrypted_aes_key', encryptedAesKey);
  form.append('iv', iv);
  form.append('tag', tag);

  if (Platform.OS === 'web') {
    let blob;
    if (typeof fileUri === 'string' && (fileUri.startsWith('data:') || fileUri.startsWith('blob:'))) {
      const res = await fetch(fileUri);
      blob = await res.blob();
    } else {
      blob = fileUri;
    }
    form.append('file', blob, fileName);
  } else {
    form.append('file', { uri: fileUri, name: fileName, type: 'application/octet-stream' });
  }

  const { data } = await client.post('/files/upload', form, {
    timeout: 120000,
  });
  return data;
}

// Assumes the backend returns { filename, encrypted_aes_key, iv, tag, ciphertext }
// with ciphertext base64-encoded — backend/ has no files_routes.py yet to confirm against.
export async function downloadFile(fileId) {
  const { data } = await client.get(`/files/${fileId}`);
  return data;
}

export async function fetchCurrentUser() {
  const { data } = await client.get('/auth/me');
  return data;
}

export async function fetchAllUsers() {
  const { data } = await client.get('/auth/users');
  return data;
}

export async function searchUserByEmail(email) {
  const { data } = await client.get('/auth/users/search', { params: { email } });
  return data;
}

export async function fetchMessages(contactId) {
  const { data } = await client.get(`/auth/messages/${contactId}`);
  return data;
}

export async function fetchConnections() {
  const { data } = await client.get('/connections/');
  return data;
}

export async function fetchPendingRequests() {
  const { data } = await client.get('/connections/pending');
  return data;
}

export async function searchUsersToConnect(q) {
  const { data } = await client.get('/connections/search', { params: { q } });
  return data;
}

export async function sendConnectionRequest(receiverId) {
  const { data } = await client.post('/connections/request', { receiver_id: receiverId });
  return data;
}

export async function acceptConnection(connectionId) {
  const { data } = await client.put(`/connections/${connectionId}/accept`);
  return data;
}

export async function rejectConnection(connectionId) {
  const { data } = await client.put(`/connections/${connectionId}/reject`);
  return data;
}

export async function updateProfileName(name) {
  const { data } = await client.put('/auth/me', { name });
  return data;
}

export async function clearAllMessages() {
  const { data } = await client.delete('/auth/messages');
  return data;
}

export async function forgotPassword(email) {
  const { data } = await client.post('/auth/forgot-password', { email });
  return data;
}

export async function resetPassword(email, code, newPassword) {
  const { data } = await client.post('/auth/reset-password', { email, code, new_password: newPassword });
  return data;
}

export async function deleteAccount() {
  const { data } = await client.delete('/auth/me');
  return data;
}




