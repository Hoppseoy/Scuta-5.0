// src/utils/crypto.ts

// Helper to encode strings to Uint8Array
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Derives an AES-GCM key from a passphrase and a salt.
 * We use PBKDF2 with 100,000 iterations.
 */
export async function deriveKey(passphrase: string, salt: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

const NATO = ["ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT", "GOLF", "HOTEL", "INDIA", "JULIET", "KILO", "LIMA", "MIKE", "NOVEMBER", "OSCAR", "PAPA", "QUEBEC", "ROMEO", "SIERRA", "TANGO", "UNIFORM", "VICTOR", "WHISKEY", "XRAY", "YANKEE", "ZULU"];

export async function getFingerprint(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey("raw", key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", exported);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  // Take first 4 bytes and map to NATO
  const words = hashArray.slice(0, 4).map(b => NATO[b % NATO.length]);
  return words.join('-');
}

/**
 * Encrypts a plaintext string using the derived key.
 * Returns a base64 encoded string containing the IV and ciphertext.
 */
export async function encryptMessage(text: string, key: CryptoKey): Promise<string> {
  // Generate a random 12-byte initialization vector
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    encoder.encode(text)
  );

  // Combine IV and ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  // Convert to base64 for easy transport
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts a base64 encoded string (IV + ciphertext) using the derived key.
 */
export async function decryptMessage(encryptedBase64: string, key: CryptoKey): Promise<string> {
  try {
    // Decode base64
    const binaryStr = atob(encryptedBase64);
    const combined = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      combined[i] = binaryStr.charCodeAt(i);
    }

    // Extract IV (first 12 bytes) and ciphertext
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      ciphertext
    );

    return decoder.decode(decryptedBuffer);
  } catch (error) {
    console.error('Decryption failed:', error);
    return '[Decryption Failed - Invalid Key or Corrupted Message]';
  }
}
