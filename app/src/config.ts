const apiUrlEnv = process.env.EXPO_PUBLIC_API_URL;

if (!apiUrlEnv) {
  console.warn(
    'Falta EXPO_PUBLIC_API_URL. Copiá app/.env.example a app/.env y poné ' +
      'la IP de tu PC en la red (no "localhost": el celular la necesita para encontrarte).'
  );
}

export const API_URL = apiUrlEnv ?? 'http://localhost:3000';
