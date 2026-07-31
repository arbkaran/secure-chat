import { Buffer } from 'buffer';
import {
  createCipheriv,
  createDecipheriv,
  publicEncrypt,
  privateDecrypt,
  randomBytes,
  constants,
} from './cryptoAdapter';



// Fresh AES key + nonce per call — never reuse a nonce with the same key.
export function hybridEncrypt(plaintext, receiverPublicPem) {
  const aesKey = randomBytes(32);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', aesKey, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const encryptedAesKey = publicEncrypt(
    { key: receiverPublicPem, padding: constants.RSA_PKCS1_OAEP_PADDING },
    aesKey,
  );

  return {
    encrypted_aes_key: encryptedAesKey.toString('base64'),
    iv: nonce.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export async function hybridDecrypt(packet, privateKeyPem) {
  const aesKey = privateDecrypt(
    { key: privateKeyPem, padding: constants.RSA_PKCS1_OAEP_PADDING },
    Buffer.from(packet.encrypted_aes_key, 'base64'),
  );
  const decipher = createDecipheriv(
    'aes-256-gcm',
    aesKey,
    Buffer.from(packet.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(packet.tag, 'base64'));
  // decipher.final() throws on a bad tag — that's tamper detection, don't swallow it.
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(packet.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
