import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ApiError } from '../apiClient';
import { useAuth } from './AuthContext';
import { Campo } from '../ui/Campo';
import { Boton } from '../ui/Boton';
import { MensajeError } from '../ui/MensajeError';
import { colores } from '../ui/colores';
import type { AuthStackParamList } from '../navigation/types';

const CONTRASENA_MIN_LENGTH = 8;

type Navegacion = NativeStackNavigationProp<AuthStackParamList, 'Registro'>;

export function RegistroScreen() {
  const { registrarse } = useAuth();
  const navigation = useNavigation<Navegacion>();
  const [email, setEmail] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [consentimiento, setConsentimiento] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function manejarSubmit() {
    setError(null);
    if (!email.trim() || !contrasena) {
      setError('Completá el correo y la contraseña');
      return;
    }
    if (contrasena.length < CONTRASENA_MIN_LENGTH) {
      setError(`La contraseña debe tener al menos ${CONTRASENA_MIN_LENGTH} caracteres`);
      return;
    }
    if (!consentimiento) {
      setError('Tenés que aceptar los términos y condiciones');
      return;
    }
    setEnviando(true);
    try {
      await registrarse(email.trim(), contrasena);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <LinearGradient colors={[colores.gradienteFin, colores.gradienteInicio]} style={estilos.gradiente}>
      <KeyboardAwareScrollView
        style={estilos.areaSegura}
        contentContainerStyle={estilos.contenedor}
        enableOnAndroid
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginBottom: 30 }}>
          <Image source={require('../../assets/LOGOAQUORA.png')} style={estilos.logo} resizeMode="contain" />
          <Text style={estilos.subtitulo}>Crea una cuenta para continuar</Text>
        </View>

        <View>
          <Campo
            estiloContenedor={estilos.campoCorreo}
            claro
            etiqueta="Correo electrónico"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!enviando}
          />
          <Campo
            estiloContenedor={estilos.campoContrasena}
            claro
            etiqueta="Contraseña"
            ayuda="Debe tener como mínimo 8 carácteres"
            value={contrasena}
            onChangeText={setContrasena}
            secureTextEntry
            editable={!enviando}
          />

          <Pressable
            style={estilos.filaConsentimiento}
            onPress={() => setConsentimiento((valor) => !valor)}
            disabled={enviando}
          >
            <View style={[estilos.casillero, consentimiento && estilos.casilleroMarcado]}>
              {consentimiento && <Text style={estilos.casilleroTilde}>✓</Text>}
            </View>
            <Text style={estilos.textoConsentimiento}>
              Acepto los términos y condiciones de <Text style={estilos.textoConsentimientoNegrita}>Aquora</Text>
            </Text>
          </Pressable>

          {error && <MensajeError texto={error} />}

          <Boton texto="Crear cuenta" onPress={manejarSubmit} cargando={enviando} />

          <Pressable style={estilos.filaEnlace} onPress={() => navigation.goBack()} disabled={enviando}>
            <Text style={estilos.enlace}>¿Ya tenés cuenta? </Text>
            <Text style={estilos.enlaceNegrita}>Iniciá sesión</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </LinearGradient>
  );
}

const estilos = StyleSheet.create({
  gradiente: { flex: 1 },
  areaSegura: { flex: 1 },
  contenedor: {
    flexGrow: 1,
    paddingTop: 83,
    paddingBottom: 83,
    paddingHorizontal: 40,
    justifyContent: "space-around",
  },
  logo: {
    width: 304,
    height: 171,
    alignSelf: "center",
    marginBottom: 16,
  },
  subtitulo: {
    color: colores.textoOscuro,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  filaConsentimiento: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    marginBottom: 16,
  },
  campoCorreo: { marginBottom: 34 },
  campoContrasena: { marginBottom: 57 }, 
  casillero: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colores.blanco,
    alignItems: 'center',
    justifyContent: 'center',
  },
  casilleroMarcado: { backgroundColor: colores.blanco },
  casilleroTilde: { color: colores.acento, fontSize: 13, fontWeight: '700' },
  textoConsentimiento: { flex: 1, fontSize: 13, color: colores.textoOscuro },
  textoConsentimientoNegrita: { fontWeight: '800' },
  filaEnlace: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  enlace: { color: colores.textoOscuro, fontSize: 13 },
  enlaceNegrita: { color: colores.textoOscuro, fontSize: 13, fontWeight: '800' },
});
