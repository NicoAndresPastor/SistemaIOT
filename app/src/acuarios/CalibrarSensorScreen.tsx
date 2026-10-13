import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../apiClient';
import { calibrarLeer, calibrarPunto, calibrarGuardar, type ParametroCalibrable, type PuntoCalibracion } from './api';
import { Campo } from '../ui/Campo';
import { Boton } from '../ui/Boton';
import { MensajeError } from '../ui/MensajeError';
import { colores } from '../ui/colores';
import type { ApplicationStackParamList } from '../navigation/types';

type Navegacion = NativeStackNavigationProp<ApplicationStackParamList, 'CalibrarSensor'>;
type Ruta = RouteProp<ApplicationStackParamList, 'CalibrarSensor'>;

const PARAMETROS: { valor: ParametroCalibrable; etiqueta: string; unidad: string }[] = [
  { valor: 'TEMP', etiqueta: 'Temperatura', unidad: '°C' },
  { valor: 'PH', etiqueta: 'pH', unidad: '' },
  { valor: 'COND', etiqueta: 'Conductividad', unidad: ' µS/cm' },
];

export function CalibrarSensorScreen() {
  const { accessToken } = useAuth();
  const navigation = useNavigation<Navegacion>();
  const { params } = useRoute<Ruta>();
  const insets = useSafeAreaInsets();
  const acuario = params.acuario;

  const [parametro, setParametro] = useState<ParametroCalibrable>('TEMP');
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [puntoActivo, setPuntoActivo] = useState(1);
  const [puntosConfirmados, setPuntosConfirmados] = useState<(PuntoCalibracion | null)[]>([
    null,
    null,
    null,
  ]);
  const [lecturaActual, setLecturaActual] = useState<number | null>(null);
  const [valorReferencia, setValorReferencia] = useState('');
  const [midiendo, setMidiendo] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actual = PARAMETROS.find((p) => p.valor === parametro)!;
  const ocupado = midiendo || confirmando || finalizando;
  const cantidadConfirmados = puntosConfirmados.filter((p) => p !== null).length;

  function reiniciar(nuevoParametro: ParametroCalibrable) {
    setParametro(nuevoParametro);
    setPuntoActivo(1);
    setPuntosConfirmados([null, null, null]);
    setLecturaActual(null);
    setValorReferencia('');
    setError(null);
  }

  async function manejarMedir() {
    if (!accessToken) return;
    setError(null);
    setMidiendo(true);
    try {
      const respuesta = await calibrarLeer(accessToken, acuario.id, parametro);
      setLecturaActual(respuesta.lectura);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor');
    } finally {
      setMidiendo(false);
    }
  }

  async function manejarConfirmar() {
    if (!accessToken || lecturaActual === null) return;
    setError(null);
    const referencia = Number(valorReferencia.replace(',', '.'));
    if (!valorReferencia.trim() || Number.isNaN(referencia)) {
      setError('Ingresá el valor de la solución patrón');
      return;
    }

    setConfirmando(true);
    try {
      const respuesta = await calibrarPunto(accessToken, acuario.id, parametro, puntoActivo, referencia);
      const puntos = [...puntosConfirmados];
      puntos[puntoActivo - 1] = {
        valorReferencia: referencia,
        lecturaAntes: respuesta.lecturaAntes,
        lecturaDespues: respuesta.lecturaDespues,
      };
      setPuntosConfirmados(puntos);

      if (puntoActivo < 3) {
        setPuntoActivo(puntoActivo + 1);
        setLecturaActual(null);
        setValorReferencia('');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor');
    } finally {
      setConfirmando(false);
    }
  }

  async function manejarFinalizar() {
    if (!accessToken) return;
    const puntos = puntosConfirmados.filter((p): p is PuntoCalibracion => p !== null);
    if (puntos.length === 0) return;

    setError(null);
    setFinalizando(true);
    try {
      await calibrarGuardar(accessToken, acuario.id, parametro, puntos);
      navigation.goBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor');
      setFinalizando(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F4F1EC' }}>
      <View
        style={{
          height: 100 + insets.top,
          backgroundColor: colores.acentoFormulario,
          borderBottomRightRadius: 56,
          overflow: 'hidden',
          justifyContent: 'flex-end',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 16,
            paddingBottom: 20,
          }}
        >
          <Pressable
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={24} color={colores.blanco} />
            <Text style={{ color: colores.blanco, fontSize: 24, fontWeight: '800' }}>Calibrar sensor</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 24, flexGrow: 1 }}>
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colores.etiqueta, marginBottom: 8 }}>
            Parámetro
          </Text>
          <Pressable
            onPress={() => !ocupado && setSelectorAbierto((a) => !a)}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: colores.blanco,
              borderWidth: 1,
              borderColor: colores.borde,
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 14,
            }}
          >
            <Text style={{ fontSize: 15, color: colores.texto, fontWeight: '600' }}>{actual.etiqueta}</Text>
            <Ionicons name={selectorAbierto ? 'chevron-up' : 'chevron-down'} size={18} color={colores.textoSecundario} />
          </Pressable>
          {selectorAbierto && (
            <View
              style={{
                marginTop: 6,
                backgroundColor: colores.blanco,
                borderWidth: 1,
                borderColor: colores.borde,
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              {PARAMETROS.map((p) => (
                <Pressable
                  key={p.valor}
                  onPress={() => {
                    reiniciar(p.valor);
                    setSelectorAbierto(false);
                  }}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    backgroundColor: p.valor === parametro ? colores.acentoSuave : colores.blanco,
                  }}
                >
                  <Text style={{ fontSize: 15, color: colores.texto }}>{p.etiqueta}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          {[1, 2, 3].map((numero) => {
            const activo = numero === puntoActivo;
            const confirmado = puntosConfirmados[numero - 1] !== null;
            return (
              <View
                key={numero}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 4,
                  paddingVertical: 10,
                  borderRadius: 12,
                  backgroundColor: activo ? colores.acento : colores.borde,
                }}
              >
                <Text
                  style={{
                    fontSize: 13.5,
                    fontWeight: '700',
                    color: activo ? colores.blanco : colores.textoSecundario,
                  }}
                >
                  Punto {numero}
                </Text>
                {confirmado && (
                  <Ionicons
                    name="checkmark-circle"
                    size={14}
                    color={activo ? colores.blanco : colores.estadoOk}
                  />
                )}
              </View>
            );
          })}
        </View>

        <View
          style={{
            backgroundColor: colores.blanco,
            borderWidth: 1,
            borderColor: colores.borde,
            borderRadius: 14,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: colores.etiqueta, marginBottom: 8 }}>
            Valor sensado
          </Text>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colores.texto, marginBottom: 12 }}>
            {lecturaActual !== null ? `${lecturaActual.toFixed(2)}${actual.unidad}` : '—'}
          </Text>
          <Boton texto="Medir" onPress={manejarMedir} cargando={midiendo} disabled={confirmando} variante="secundario" />
        </View>

        <Campo
          etiqueta="Valor de la solución patrón"
          placeholder="0.00"
          value={valorReferencia}
          onChangeText={setValorReferencia}
          keyboardType="numeric"
          editable={!ocupado}
        />

        {error && <MensajeError texto={error} />}

        <Boton
          texto="Confirmar"
          onPress={manejarConfirmar}
          cargando={confirmando}
          disabled={midiendo || finalizando || lecturaActual === null}
          variante="formulario"
        />
        <Boton
          texto={
            cantidadConfirmados === 1
              ? 'Finalizar con 1 punto'
              : `Finalizar con ${cantidadConfirmados} puntos`
          }
          onPress={manejarFinalizar}
          cargando={finalizando}
          disabled={ocupado || cantidadConfirmados === 0}
          variante="secundario"
        />
      </ScrollView>

      <Image source={require('../../assets/calibracion_inf.png')} style={{ width: '100%' }} />
    </View>
  );
}
