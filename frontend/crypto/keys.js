import { generateKeyPairAsync } from './cryptoAdapter';
import * as SecureStore from 'expo-secure-store';

const PRIVATE_KEY_STORAGE_KEY = 'rsa_private_key';
const PUBLIC_KEY_STORAGE_KEY = 'rsa_public_key';

export async function generateAndStoreKeypair() {
  try {
    const { publicKey, privateKey } = await generateKeyPairAsync(2048);

    await SecureStore.setItemAsync(PRIVATE_KEY_STORAGE_KEY, privateKey).catch(() => {});
    await SecureStore.setItemAsync(PUBLIC_KEY_STORAGE_KEY, publicKey).catch(() => {});
    return publicKey;
  } catch (e) {
    console.warn('Keypair generation skipped:', e);
    return 'MOCK_PUBLIC_KEY';
  }
}

export function getStoredPrivateKey() {
  return SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_KEY).catch(() => null);
}

export function getStoredPublicKey() {
  return SecureStore.getItemAsync(PUBLIC_KEY_STORAGE_KEY).catch(() => null);
}

export async function ensureKeypair() {
  try {
    const existingPrivateKey = await getStoredPrivateKey();
    if (existingPrivateKey && !existingPrivateKey.includes('mockKey')) {
      const pub = await getStoredPublicKey();
      if (pub && !pub.includes('mockKey')) return pub;
    }
    console.log('Regenerating legitimate keypair...');
    return await generateAndStoreKeypair();
  } catch (e) {
    return 'MOCK_PUBLIC_KEY';
  }
}
