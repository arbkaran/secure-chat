// Populated from frontend/.env at build time (Expo inlines EXPO_PUBLIC_* vars).
// `localhost` on a phone means the phone itself — point these at your dev
// machine's LAN IP when testing on a real device.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';
export const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL ?? API_BASE_URL;
