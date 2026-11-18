import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../apiClient';
import { listarBitacora, type EntradaBitacora } from './api';
import { MensajeError } from '../ui/MensajeError';
import { colores } from '../ui/colores';
import type { AcuarioTabParamList, ApplicationStackParamList } from '../navigation/types';

type Navegacion = BottomTabNavigationProp<AcuarioTabParamList, 'Bitacora'>;
type StackNavegacion = NativeStackNavigationProp<ApplicationStackParamList>;
type Ruta = RouteProp<AcuarioTabParamList, 'Bitacora'>;

function formatearFecha(fechaIso: string): string {
  const fecha = new Date(fechaIso);
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const anio = String(fecha.getFullYear()).slice(-2);
  return `${dia}/${mes}/${anio}`;
}

export function BitacoraScreen() {
  const { accessToken } = useAuth();
  const navigation = useNavigation<Navegacion>();
  const { params } = useRoute<Ruta>();
  const insets = useSafeAreaInsets();
  const acuario = params.acuario;

  const [entradas, setEntradas] = useState<EntradaBitacora[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargarEntradas = useCallback(async () => {
    if (!accessToken) return;
    try {
      setEntradas(await listarBitacora(accessToken, acuario.id));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor');
    } finally {
      setCargando(false);
    }
  }, [accessToken, acuario.id]);

  useFocusEffect(
    useCallback(() => {
      cargarEntradas();
    }, [cargarEntradas])
  );

  function abrirCrear() {
    navigation.getParent<StackNavegacion>()?.navigate('CrearEntradaBitacora', { acuario });
  }

  function abrirEditar(entrada: EntradaBitacora) {
    navigation.getParent<StackNavegacion>()?.navigate('CrearEntradaBitacora', { acuario, entrada });
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F4F1EC' }}>
      <View
        style={{
          height: 100 + insets.top,
          backgroundColor: colores.acento,
          borderBottomRightRadius: 56,
          overflow: 'hidden',
        }}
      >
        <View style={{ height: 30, width: '100%', backgroundColor: '#014c7d' }} />
        <Image source={require('../../assets/SUPazul.png')} style={{ width: '100%' }} />
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
          <Text style={{ color: colores.blanco, fontSize: 24, fontWeight: '800' }} numberOfLines={1}>
            {acuario.nombre}
          </Text>
          <Image source={require('../../assets/LOGO.png')} style={{ right: 20, width: 52, height: 52 }} resizeMode="contain" />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, flexGrow: 1 }}>
        {error && <MensajeError texto={error} />}

        {!cargando && entradas.length === 0 && (
          <Text style={{ textAlign: 'center', color: colores.textoSecundario, marginTop: 24 }}>
            Todavía no hay entradas en la bitácora
          </Text>
        )}

        {entradas.map((entrada, indice) => (
          <View
            key={entrada.id}
            style={{
              paddingVertical: 14,
              borderBottomWidth: indice < entradas.length - 1 ? 1 : 0,
              borderBottomColor: colores.borde,
              gap: 6,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 12, color: colores.textoSecundario }}>{formatearFecha(entrada.fecha_evento)}</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colores.texto }}>
                  {entrada.observacion || entrada.tipo_evento_nombre}
                </Text>
              </View>
              <Pressable onPress={() => abrirEditar(entrada)} hitSlop={8}>
                <Ionicons name="create-outline" size={20} color={colores.textoSecundario} />
              </Pressable>
            </View>

            {entrada.imagenes.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {entrada.imagenes.map((imagen) => (
                  <Image
                    key={imagen.id}
                    source={{ uri: imagen.url }}
                    style={{ width: 64, height: 64, borderRadius: 10 }}
                  />
                ))}
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <Pressable
        onPress={abrirCrear}
        style={{
          position: 'absolute',
          right: 20,
          bottom: 20,
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: colores.gradienteInicio,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.15,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },
          elevation: 6,
        }}
      >
        <Ionicons name="add" size={28} color={colores.blanco} />
      </Pressable>
    </View>
  );
}
