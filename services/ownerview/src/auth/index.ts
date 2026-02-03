export { AuthService, AuthError, type VerifyResult } from "./authService.js";
export { NonceStore } from "./nonceStore.js";
export { SessionManager, createSignMessage, verifyWalletSignature } from "./session.js";
export type { AuthConfig, NonceRecord, SessionPayload } from "./types.js";
export { DEFAULT_AUTH_CONFIG } from "./types.js";
