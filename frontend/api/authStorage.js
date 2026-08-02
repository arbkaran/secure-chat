import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'access_token';
const USER_ID_KEY = 'user_id';
const EMAIL_KEY = 'registered_email';
const PASSWORD_KEY = 'registered_password';

export function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getUserId() {
  const value = await SecureStore.getItemAsync(USER_ID_KEY);
  return value ? Number(value) : null;
}

export function getStoredEmail() {
  return SecureStore.getItemAsync(EMAIL_KEY);
}

export function getStoredPassword() {
  return SecureStore.getItemAsync(PASSWORD_KEY);
}

export async function setStoredCredentials(email, password) {
  if (email) await SecureStore.setItemAsync(EMAIL_KEY, email);
  if (password) await SecureStore.setItemAsync(PASSWORD_KEY, password);
}

export async function setSession(accessToken, userId) {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  if (userId != null) {
    await SecureStore.setItemAsync(USER_ID_KEY, String(userId));
  }
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_ID_KEY);
  await SecureStore.deleteItemAsync(EMAIL_KEY);
  await SecureStore.deleteItemAsync(PASSWORD_KEY);
  await SecureStore.deleteItemAsync('cleared_chats_map');
}

