// Auth types for wallet-based authentication

export interface AuthState {
  isConnected: boolean;
  isAuthenticated: boolean;
  address: string | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
}

export interface NonceResponse {
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface VerifyResponse {
  token: string;
  address: string;
  expiresAt: string;
}

/** Raw encrypted response from the ownerview server */
export interface EncryptedHoleCardsResponse {
  tableId: string;
  handId: string;
  seatIndex: number;
  encryptedCards: {
    ephemeralPubKey: string;
    iv: string;
    ciphertext: string;
    mac: string;
  };
}

/** Decrypted hole cards — returned by getHoleCards() after client-side decryption */
export interface HoleCardsResponse {
  tableId: string;
  handId: string;
  seatIndex: number;
  cards: [number, number];
}

export interface AuthContextValue extends AuthState {
  connect: () => Promise<void>;
  disconnect: () => void;
  authenticate: () => Promise<void>;
  getHoleCards: (tableId: string, handId: string) => Promise<HoleCardsResponse | null>;
}
