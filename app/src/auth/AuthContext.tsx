import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';
import * as api from './api';
import { borrarRefreshToken, guardarRefreshToken, leerRefreshToken } from './storage';


let sistemaOperativo: 'IOS' | 'ANDROID';
if (Platform.OS === 'ios') {
  sistemaOperativo = 'IOS';
} else {
  sistemaOperativo = 'ANDROID';
}

interface AuthContextValor {
  accessToken: string | null;
  restaurandoSesion: boolean;
  iniciarSesion(email: string, contrasena: string): Promise<void>;
  registrarse(email: string, contrasena: string): Promise<void>;
  cerrarSesion(): Promise<void>;
}

const AuthContext = createContext<AuthContextValor | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [restaurandoSesion, setRestaurandoSesion] = useState(true);

  useEffect(() => {
    async function restaurar() {
      try {
        const refreshToken = await leerRefreshToken();
        if (!refreshToken) {
          return;
        }
        const resultado = await api.refrescarToken(refreshToken);
        setAccessToken(resultado.accessToken);
      } catch (error) { 
        try {
          await borrarRefreshToken();
        } catch (errorAlBorrar) {
        }
      } finally {
        setRestaurandoSesion(false);
      }
    }
    restaurar();
  }, []);

  async function iniciarSesion(email: string, contrasena: string) {
    const tokens = await api.iniciarSesion(email, contrasena, sistemaOperativo);
    await guardarRefreshToken(tokens.refreshToken);
    setAccessToken(tokens.accessToken);
  }

  async function registrarse(email: string, contrasena: string) {
    await api.registrar(email, contrasena);
    await iniciarSesion(email, contrasena);
  }

  async function cerrarSesion() {
    const refreshToken = await leerRefreshToken();
    if (refreshToken) {
      try {
        await api.cerrarSesion(refreshToken);
      } catch (error) {
      }
    }
    await borrarRefreshToken();
    setAccessToken(null);
  }

  return (
    <AuthContext.Provider
      value={{
        accessToken: accessToken,
        restaurandoSesion: restaurandoSesion,
        iniciarSesion: iniciarSesion,
        registrarse: registrarse,
        cerrarSesion: cerrarSesion,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValor {
  const contexto = useContext(AuthContext);
  if (!contexto) {
    throw new Error('useAuth debe usarse dentro de un AuthProvider');
  }
  return contexto;
}
