export interface Message {
  id: string;
  sender: string;
  text: string; // This will be encrypted when sent, decrypted when received
  timestamp: number;
  type?: 'text' | 'image' | 'audio';
  ttl?: number;
  expiresAt?: number;
}

export interface UserSession {
  username: string;
  roomId: string;
  passphraseKey: CryptoKey;
  isOwner: boolean;
  devicePseudonym?: string;
}
