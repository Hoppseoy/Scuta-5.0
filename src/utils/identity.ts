const DEVICE_ID_KEY = 'scuta.deviceId';
const PUBLIC_KEY_KEY = 'scuta.identity.publicJwk';
const PRIVATE_KEY_KEY = 'scuta.identity.privateJwk';

const encoder = new TextEncoder();

export type DeviceIdentity = {
  deviceId: string;
  publicKeyJwk: JsonWebKey;
  privateKey: CryptoKey;
};

function toBase64(input: ArrayBuffer): string {
  const bytes = new Uint8Array(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const generated = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_KEY, generated);
  return generated;
}

async function loadStoredIdentity(): Promise<DeviceIdentity | null> {
  const publicRaw = localStorage.getItem(PUBLIC_KEY_KEY);
  const privateRaw = localStorage.getItem(PRIVATE_KEY_KEY);
  if (!publicRaw || !privateRaw) return null;

  try {
    const publicKeyJwk = JSON.parse(publicRaw) as JsonWebKey;
    const privateKeyJwk = JSON.parse(privateRaw) as JsonWebKey;
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      privateKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );

    return {
      deviceId: getOrCreateDeviceId(),
      publicKeyJwk,
      privateKey,
    };
  } catch {
    return null;
  }
}

async function createIdentity(): Promise<DeviceIdentity> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );

  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

  localStorage.setItem(PUBLIC_KEY_KEY, JSON.stringify(publicKeyJwk));
  localStorage.setItem(PRIVATE_KEY_KEY, JSON.stringify(privateKeyJwk));

  return {
    deviceId: getOrCreateDeviceId(),
    publicKeyJwk,
    privateKey: keyPair.privateKey,
  };
}

export async function getOrCreateIdentity(): Promise<DeviceIdentity> {
  return (await loadStoredIdentity()) || createIdentity();
}

export async function signJoinProof(
  identity: DeviceIdentity,
  roomId: string,
  username: string,
  timestamp: number,
  nonce: string
): Promise<string> {
  const payload = `${roomId}|${username}|${identity.deviceId}|${timestamp}|${nonce}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    identity.privateKey,
    encoder.encode(payload)
  );
  return toBase64(signature);
}
