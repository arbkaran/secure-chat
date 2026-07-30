"""Hybrid RSA+AES encrypt/decrypt helpers, for server-side testing against the
same wire format the React Native client produces (base64 fields:
encrypted_aes_key, iv, tag, ciphertext).
"""
import base64

from Crypto.Cipher import AES, PKCS1_OAEP
from Crypto.PublicKey import RSA
from Crypto.Random import get_random_bytes


def hybrid_encrypt(plaintext: bytes, receiver_public_pem: str):
    aes_key = get_random_bytes(32)
    nonce = get_random_bytes(12)
    cipher_aes = AES.new(aes_key, AES.MODE_GCM, nonce=nonce)
    ciphertext, tag = cipher_aes.encrypt_and_digest(plaintext)
    cipher_rsa = PKCS1_OAEP.new(RSA.import_key(receiver_public_pem))
    encrypted_aes_key = cipher_rsa.encrypt(aes_key)
    return encrypted_aes_key, nonce, ciphertext, tag


def hybrid_decrypt(
    encrypted_aes_key: bytes, nonce: bytes, ciphertext: bytes, tag: bytes, private_pem: str
) -> bytes:
    cipher_rsa = PKCS1_OAEP.new(RSA.import_key(private_pem))
    aes_key = cipher_rsa.decrypt(encrypted_aes_key)
    cipher_aes = AES.new(aes_key, AES.MODE_GCM, nonce=nonce)
    return cipher_aes.decrypt_and_verify(ciphertext, tag)


def hybrid_encrypt_b64(plaintext: bytes, receiver_public_pem: str) -> dict:
    """Same as hybrid_encrypt but returns the base64-string packet shape used
    on the wire by crypto/hybrid.js (encrypted_aes_key, iv, tag, ciphertext)."""
    encrypted_aes_key, nonce, ciphertext, tag = hybrid_encrypt(
        plaintext, receiver_public_pem
    )
    return {
        "encrypted_aes_key": base64.b64encode(encrypted_aes_key).decode(),
        "iv": base64.b64encode(nonce).decode(),
        "tag": base64.b64encode(tag).decode(),
        "ciphertext": base64.b64encode(ciphertext).decode(),
    }


def hybrid_decrypt_b64(packet: dict, private_pem: str) -> bytes:
    """Inverse of hybrid_encrypt_b64 — decrypts a base64 wire packet."""
    return hybrid_decrypt(
        base64.b64decode(packet["encrypted_aes_key"]),
        base64.b64decode(packet["iv"]),
        base64.b64decode(packet["ciphertext"]),
        base64.b64decode(packet["tag"]),
        private_pem,
    )
