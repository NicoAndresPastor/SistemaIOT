import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../apiClient';
import { listarEnchufes, cambiarEstadoEnchufe, type Enchufe } from './api';
import { MensajeError } from '../ui/MensajeError';
import { colores } from '../ui/colores';
import type { AcuarioTabParamList } from '../navigation/types';

const INTERVALO_CONSULTA_MS = 3000;
const TIEMPO_ESPERA_CONFIRMACION_MS = 15000;

type Ruta = RouteProp<AcuarioTabParamList, 'Enchufes'>;
type Navegacion = BottomTabNavigationProp<AcuarioTabParamList, 'Enchufes'>;

interface OrdenPendiente {
  estadoPedido: boolean;
  enviadaEn: number;
}

export function EnchufesScreen() {
  const { accessToken } = useAuth();
  const { params } = useRoute<Ruta>();
  const navigation = useNavigation<Navegacion>();
  const insets = useSafeAreaInsets();
  const acuario = params.acuario;

  const [enchufes, setEnchufes] = useState<Enchufe[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Canales con una orden enviada que todavia no confirmo la placa -- no se
  // actualiza el switch hasta que el estado real coincida con lo pedido
  // (sin interfaz optimista, a proposito: un rele que no conmuto no debe
  // mostrarse como si ya hubiera cambiado).
  const [pendientes, setPendientesEstado] = useState<Record<number, OrdenPendiente>>({});
  // Copia sincronica de `pendientes`: la consulta periodica necesita leer el
  // valor actual para decidir que ordenes vencieron y armar el aviso.
  const pendientesRef = useRef(pendientes);
  const [aviso, setAviso] = useState<string | null>(null);

  function setPendientes(nuevos: Record<number, OrdenPendiente>) {
    pendientesRef.current = nuevos;
    setPendientesEstado(nuevos);
  }

  const cargarEnchufes = useCallback(async () => {
    if (!accessToken) return;
    try {
      const datos = await listarEnchufes(accessToken, acuario.id);
      setEnchufes(datos);
      setError(null);

      const siguiente = { ...pendientesRef.current };
      const sinConfirmar: string[] = [];
      for (const enchufe of datos) {
        const orden = siguiente[enchufe.numero_canal];
        if (!orden) continue;
        if (orden.estadoPedido === enchufe.estado_actual) {
          delete siguiente[enchufe.numero_canal];
        } else if (Date.now() - orden.enviadaEn > TIEMPO_ESPERA_CONFIRMACION_MS) {
          delete siguiente[enchufe.numero_canal];
          sinConfirmar.push(enchufe.nombre);
        }
      }
      setPendientes(siguiente);
      if (sinConfirmar.length > 0) {
        setAviso(
          `El dispositivo no confirmó el cambio de ${sinConfirmar.join(' y ')}. ` +
            'Se muestra el último estado confirmado. Si el dispositivo está desconectado, ' +
            'la orden se aplicará cuando vuelva a conectarse.'
        );
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor');
    } finally {
      setCargando(false);
    }
  }, [accessToken, acuario.id]);

  useFocusEffect(
    useCallback(() => {
      cargarEnchufes();
      const intervalo = setInterval(cargarEnchufes, INTERVALO_CONSULTA_MS);
      return () => clearInterval(intervalo);
    }, [cargarEnchufes])
  );

  async function manejarCambiar(enchufe: Enchufe) {
    if (!accessToken || pendientesRef.current[enchufe.numero_canal]) return;
    const nuevoEstado = !enchufe.estado_actual;
    setPendientes({
      ...pendientesRef.current,
      [enchufe.numero_canal]: { estadoPedido: nuevoEstado, enviadaEn: Date.now() },
    });
    setError(null);
    setAviso(null);
    try {
      await cambiarEstadoEnchufe(accessToken, acuario.id, enchufe.numero_canal, nuevoEstado);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor');
      const siguiente = { ...pendientesRef.current };
      delete siguiente[enchufe.numero_canal];
      setPendientes(siguiente);
    }
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
          <Pressable
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, alignSelf: 'flex-end' }}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={24} color={colores.blanco} />
            <Text style={{ color: colores.blanco, fontSize: 24, fontWeight: '800' }} numberOfLines={1}>
              {acuario.nombre}
            </Text>
          </Pressable>
          <Image source={require('../../assets/LOGO.png')} style={{ right: 20, width: 52, height: 52 }} resizeMode="contain" />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingVertical: 24, gap: 16 }}>
        <Text style={{ fontSize: 15, fontWeight: '500', color: colores.texto, marginLeft: 14, marginBottom: 2 }}>
          Enchufes
        </Text>

        {error && <MensajeError texto={error} />}
        {aviso && <MensajeError texto={aviso} />}

        {!cargando && enchufes.length === 0 && !error && (
          <Text style={{ textAlign: 'center', color: colores.textoSecundario, marginTop: 24 }}>
            Todavía no hay enchufes informados por el dispositivo
          </Text>
        )}

        {enchufes.map((enchufe) => {
          const pendiente = pendientes[enchufe.numero_canal] !== undefined;
          const prendido = enchufe.estado_actual;
          return (
            <View
              key={enchufe.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: colores.blanco,
                borderRadius: 12,
                paddingVertical: 10,
                paddingLeft: 12,
                paddingRight: 8,
                shadowColor: '#000',
                shadowOpacity: 0.25,
                shadowRadius: 3,
                shadowOffset: { width: 0, height: 3 },
                elevation: 5,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Ionicons name={iconoEnchufe(enchufe.nombre)} size={20} color={colores.texto} />
                <Text style={{ fontSize: 15, color: colores.texto }} numberOfLines={1}>
                  {enchufe.nombre}
                </Text>
              </View>

              <Pressable
                onPress={() => manejarCambiar(enchufe)}
                disabled={pendiente}
                hitSlop={8}
                style={{
                  width: 60,
                  height: 30,
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: pendiente ? 'center' : prendido ? 'flex-end' : 'flex-start',
                  backgroundColor: pendiente ? colores.borde : prendido ? colores.gradienteFin : colores.blanco,
                  shadowColor: '#000',
                  shadowOpacity: prendido || pendiente ? 0 : 0.2,
                  shadowRadius: 2,
                  shadowOffset: { width: 0, height: 1 },
                  elevation: prendido || pendiente ? 0 : 3,
                }}
              >
                {pendiente ? (
                  <ActivityIndicator size="small" color={colores.textoSecundario} />
                ) : (
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '800',
                      color: prendido ? colores.blanco : colores.gradienteFin,
                    }}
                  >
                    {prendido ? 'on' : 'off'}
                  </Text>
                )}
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// El icono se elige por el nombre del enchufe; si no coincide con ninguno
// conocido, se usa un rayo generico.
function iconoEnchufe(nombre: string): keyof typeof Ionicons.glyphMap {
  const texto = nombre.toLowerCase();
  if (texto.includes('luz') || texto.includes('luces')) return 'bulb-outline';
  if (texto.includes('calent') || texto.includes('termo')) return 'thermometer-outline';
  if (texto.includes('filtro') || texto.includes('bomba')) return 'water-outline';
  return 'flash-outline';
}
