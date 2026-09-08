import { useState } from "react";
import { Image, View, StyleSheet, Text, TouchableOpacity } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ApiError } from "../apiClient";
import { useAuth } from "./AuthContext";
import { Campo } from "../ui/Campo";
import { Boton } from "../ui/Boton";
import { MensajeError } from "../ui/MensajeError";
import { colores } from "../ui/colores";
import type { AuthStackParamList } from "../navigation/types";

type Navegacion = NativeStackNavigationProp<AuthStackParamList, "Login">;

export function LoginScreen() {
  const { iniciarSesion } = useAuth();
  const navigation = useNavigation<Navegacion>();
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function manejarSubmit() {
    setError(null);
    if (!email.trim() || !contrasena) {
      setError("Completá el correo y la contraseña");
      return;
    }
    setEnviando(true);
    try {
      await iniciarSesion(email.trim(), contrasena);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "No se pudo conectar con el servidor",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <LinearGradient
      colors={[colores.gradienteInicio, colores.gradienteFin]}
      style={estilos.gradiente}
    >
      <KeyboardAwareScrollView
        style={estilos.areaSegura}
        contentContainerStyle={estilos.contenedor}
        enableOnAndroid
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginBottom: 30 }}>
          <Image
            source={require("../../assets/LOGOAQUORA.png")}
            style={estilos.logo}
            resizeMode="contain"
          />
          <Text style={estilos.subtitulo}>Iniciar sesión para continuar</Text>
        </View>

        <View>
          <Campo
            claro
            estiloContenedor={estilos.campoCorreo}
            etiqueta="Correo electrónico"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!enviando}
          />
          <Campo
            claro
            estiloContenedor={estilos.campoContrasena}
            etiqueta="Contraseña"
            value={contrasena}
            onChangeText={setContrasena}
            secureTextEntry
            editable={!enviando}
          />

          {error && <MensajeError texto={error} />}

          <Boton
            texto="Iniciar sesión"
            onPress={manejarSubmit}
            cargando={enviando}
          />

          <TouchableOpacity
            style={estilos.filaEnlace}
            onPress={() => navigation.navigate("Registro")}
            disabled={enviando}
            hitSlop={{top: 10, bottom: 10, right: 10, left: 10}}
          >
            <Text style={estilos.enlace}>¿No tenés cuenta? </Text>
            <Text style={estilos.enlaceNegrita}>Crear una cuenta</Text>
          </TouchableOpacity>
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
  campoCorreo: { marginBottom: 34 },
  campoContrasena: { marginBottom: 57 },
  filaEnlace: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 66,
  },
  enlace: { color: colores.textoOscuro, fontSize: 13 },
  enlaceNegrita: {
    color: colores.textoOscuro,
    fontSize: 13,
    fontWeight: "800",
  },
});
