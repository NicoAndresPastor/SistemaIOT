import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../apiClient';
import { crearAcuario } from './api';
import { Campo } from '../ui/Campo';
import { Boton } from '../ui/Boton';
import { MensajeError } from '../ui/MensajeError';
import { colores } from '../ui/colores';
import type { ApplicationStackParamList } from '../navigation/types';

type Navegacion = NativeStackNavigationProp<ApplicationStackParamList, 'CrearAcuario'>;

export function CrearAcuarioScreen() {
  const { accessToken } = useAuth();
  const navigation = useNavigation<Navegacion>();
  const insets = useSafeAreaInsets();

  const [nombre, setNombre] = useState('');
  const [volumenLitros, setVolumenLitros] = useState('');
  const [tipoAgua, setTipoAgua] = useState<'DULCE' | 'SALADA' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function manejarGuardar() {
    setError(null);
    if (!nombre.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    if (!accessToken) return;
    setGuardando(true);
    try {
      await crearAcuario(accessToken, {
        nombre: nombre.trim(),
        volumenLitros: volumenLitros.trim() ? Number(volumenLitros) : null,
        tipoAgua,
      });
      navigation.goBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor');
      setGuardando(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F4F1EC' }}>
          <View style={{ backgroundColor: '#F4F1EC' }}>
            <View
              style={{
                height: 100 + insets.top,
                backgroundColor: colores.acento,
                borderBottomRightRadius: 56,
                overflow: 'hidden',
              }}
            >
              <View style={{height: 30, width: '100%', backgroundColor: '#536f26'}}/>
              <Image
                source={require('../../assets/SUPverde.png')}
                style={{ width: '100%' }}

              />

              <View
                style={{
                  position: 'absolute',
                  top: insets.top + 20,
                  left: 0,
                  right: 0,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingTop: 12,
                }}
              >
                <Pressable
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, alignSelf: 'flex-end' }}
                  onPress={() => navigation.goBack()}
                >
                  <Ionicons name="chevron-back" size={24} color={colores.blanco} />
                  <Text style={{ color: colores.blanco, fontSize: 24, fontWeight: '800' }} numberOfLines={1}>
                    Nuevo acuario
                  </Text>
                </Pressable>
                  <Image source={require('../../assets/LOGO.png')} style={{ right: 20, width: 52, height: 52 }} resizeMode="contain" />
              </View>
            </View>
          </View>


      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 24 }}>
          <Campo etiqueta="Nombre" value={nombre} onChangeText={setNombre} maxLength={100} editable={!guardando} />
          <Campo
            etiqueta="Cantidad de litros"
            value={volumenLitros}
            onChangeText={setVolumenLitros}
            keyboardType="numeric"
            editable={!guardando}
          />

          <Text style={{ fontSize: 13, fontWeight: '700', color: colores.etiqueta, marginBottom: 8 }}>
            Tipo de agua
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            <OpcionTipoAgua
              etiqueta="Dulce"
              activo={tipoAgua === 'DULCE'}
              onPress={() => setTipoAgua('DULCE')}
              disabled={guardando}
            />
            <OpcionTipoAgua
              etiqueta="Salada"
              activo={tipoAgua === 'SALADA'}
              onPress={() => setTipoAgua('SALADA')}
              disabled={guardando}
            />
          </View>

          {error && <MensajeError texto={error} />}
          <Boton texto="Crear acuario" onPress={manejarGuardar} cargando={guardando} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function OpcionTipoAgua({
  etiqueta,
  activo,
  onPress,
  disabled,
}: {
  etiqueta: string;
  activo: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: activo ? colores.acentoFormulario : colores.borde,
      }}
    >
      <Text style={{ fontSize: 13.5, fontWeight: '700', color: activo ? colores.blanco : colores.textoSecundario }}>
        {etiqueta}
      </Text>
    </Pressable>
  );
}
