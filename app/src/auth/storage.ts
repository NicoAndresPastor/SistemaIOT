import * as SecureStore from 'expo-secure-store';

const CLAVE_REFRESH_TOKEN = 'refreshToken';

export function guardarRefreshToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(CLAVE_REFRESH_TOKEN, token);
}

export function leerRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(CLAVE_REFRESH_TOKEN);
}

export function borrarRefreshToken(): Promise<void> {
  return SecureStore.deleteItemAsync(CLAVE_REFRESH_TOKEN);
}
