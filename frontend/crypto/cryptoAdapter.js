import 'react-native-get-random-values';
import { Buffer } from 'buffer';

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

export const generateKeyPairSync = () => {
  return {
    publicKey: '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmockKey\n-----END PUBLIC KEY-----',
    privateKey: '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCmockKey\n-----END PRIVATE KEY-----',
  };
};

export const randomBytes = (size = 32) => {
  const arr = new Uint8Array(size);
  if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
    global.crypto.getRandomValues(arr);
  }
  return Buffer.from(arr);
};

export const createCipheriv = () => {
  return {
    update: (data) => (typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data)),
    final: () => Buffer.from(''),
    getAuthTag: () => Buffer.from('mockauthtag12345'),
  };
};

export const createDecipheriv = () => {
  return {
    setAuthTag: () => {},
    update: (data) => (typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data)),
    final: () => Buffer.from(''),
  };
};

export const publicEncrypt = (keyOptions, buffer) => {
  return Buffer.from(buffer || '');
};

export const privateDecrypt = (keyOptions, buffer) => {
  return Buffer.from(buffer || '');
};

export const constants = {
  RSA_PKCS1_OAEP_PADDING: 4,
};

export default {
  generateKeyPairSync,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  publicEncrypt,
  privateDecrypt,
  constants,
};
