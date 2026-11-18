import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../apiClient';
import {
  crearEntradaBitacora,
  editarEntradaBitacora,
  eliminarEntradaBitacora,
  listarTiposEvento,
  type FotoNueva,
  type TipoEvento,
} from './api';
import { Boton } from '../ui/Boton';
import { MensajeError } from '../ui/MensajeError';
import { colores } from '../ui/colores';
import type { ApplicationStackParamList } from '../navigation/types';

type Navegacion = NativeStackNavigationProp<ApplicationStackParamList, 'CrearEntradaBitacora'>;
type Ruta = RouteProp<ApplicationStackParamList, 'CrearEntradaBitacora'>;

const MAX_FOTOS = 5;
const FONDO_CAMPO = '#E8E3D8';

function formatearFecha(fecha: Date): string {
  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const anio = String(fecha.getFullYear()).slice(-2);
  return `${dia}/${mes}/${anio}`;
}

export function CrearEntradaBitacoraScreen() {
  const { accessToken } = useAuth();
  const navigation = useNavigation<Navegacion>();
  const { params } = useRoute<Ruta>();
  const insets = useSafeAreaInsets();
  const acuario = params.acuario;
  const entradaExistente = params.entrada;
  const editando = entradaExistente !== undefined;

  const [tiposEvento, setTiposEvento] = useState<TipoEvento[]>([]);
  const [tipoEventoId, setTipoEventoId] = useState<number | null>(entradaExistente?.tipo_evento_id ?? null);
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [observacion, setObservacion] = useState(entradaExistente?.observacion ?? '');
  const [fecha, setFecha] = useState(entradaExistente ? new Date(entradaExistente.fecha_evento) : new Date());
  const [mostrarCalendario, setMostrarCalendario] = useState(false);
  const [fotosExistentes, setFotosExistentes] = useState(entradaExistente?.imagenes ?? []);
  const [fotosNuevas, setFotosNuevas] = useState<FotoNueva[]>([]);
  const [procesandoFoto, setProcesandoFoto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    listarTiposEvento(accessToken)
      .then((tipos) => {
        setTiposEvento(tipos);
        setTipoEventoId((actualId) => actualId ?? tipos[0]?.id ?? null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los tipos de entrada');
      });
  }, [accessToken]);

  const nombreTipoActual = tiposEvento.find((t) => t.id === tipoEventoId)?.nombre ?? 'Cargando...';
  const totalFotos = fotosExistentes.length + fotosNuevas.length;
  const ocupado = procesandoFoto || guardando || eliminando;

  async function agregarFotos() {
    setError(null);
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      setError('Hace falta permiso para acceder a las fotos');
      return;
    }

    const resultado = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_FOTOS - totalFotos,
      quality: 1,
    });
    if (resultado.canceled || resultado.assets.length === 0) return;

    setProcesandoFoto(true);
    try {
      const nuevas: FotoNueva[] = [];
      for (const activo of resultado.assets) {
        const manipulada = await ImageManipulator.manipulateAsync(
          activo.uri,
          [{ resize: { width: 1280 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        );
        nuevas.push({
          uri: manipulada.uri,
          nombre: `foto_${Date.now()}_${nuevas.length}.jpg`,
          tipo: 'image/jpeg',
        });
      }
      setFotosNuevas((prev) => [...prev, ...nuevas].slice(0, MAX_FOTOS - fotosExistentes.length));
    } catch {
      setError('No se pudieron procesar las fotos');
    } finally {
      setProcesandoFoto(false);
    }
  }

  function quitarFotoExistente(id: string) {
    setFotosExistentes((prev) => prev.filter((f) => f.id !== id));
  }

  function quitarFotoNueva(uri: string) {
    setFotosNuevas((prev) => prev.filter((f) => f.uri !== uri));
  }

  async function manejarGuardar() {
    if (!accessToken || tipoEventoId === null) return;
    setError(null);
    setGuardando(true);
    try {
      if (editando) {
        const idsOriginales = entradaExistente!.imagenes.map((f) => f.id);
        const idsConservados = fotosExistentes.map((f) => f.id);
        const fotosAEliminar = idsOriginales.filter((id) => !idsConservados.includes(id));
        await editarEntradaBitacora(accessToken, acuario.id, entradaExistente!.id, {
          tipoEventoId,
          observacion: observacion.trim(),
          fechaEvento: fecha.toISOString(),
          fotosAEliminar,
          fotosNuevas,
        });
      } else {
        await crearEntradaBitacora(accessToken, acuario.id, {
          tipoEventoId,
          observacion: observacion.trim(),
          fechaEvento: fecha.toISOString(),
          fotos: fotosNuevas,
        });
      }
      navigation.goBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor');
      setGuardando(false);
    }
  }

  function manejarEliminar() {
    Alert.alert('Eliminar entrada', '¿Querés eliminar esta entrada de la bitácora?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          if (!accessToken || !entradaExistente) return;
          setError(null);
          setEliminando(true);
          try {
            await eliminarEntradaBitacora(accessToken, acuario.id, entradaExistente.id);
            navigation.goBack();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor');
            setEliminando(false);
          }
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ height: 100 + insets.top }} />
      <View
        style={{
          flex: 1,
          backgroundColor: '#F4F1EC',
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            backgroundColor: colores.acento,
            paddingTop: 16,
            paddingBottom: 16,
            paddingHorizontal: 20,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: colores.blanco, fontSize: 17, fontWeight: '800' }}>
            {editando ? 'Editar entrada' : 'Nueva entrada'}
          </Text>
          <Pressable onPress={() => navigation.goBack()} disabled={ocupado}>
            <Ionicons name="close-circle" size={26} color={colores.blanco} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colores.etiqueta, marginBottom: 8 }}>Fecha</Text>
          <Pressable
            onPress={() => !ocupado && setMostrarCalendario(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              backgroundColor: FONDO_CAMPO,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
              marginBottom: 18,
            }}
          >
            <Ionicons name="calendar-outline" size={18} color={colores.texto} />
            <Text style={{ fontSize: 15, color: colores.texto, fontWeight: '600' }}>{formatearFecha(fecha)}</Text>
          </Pressable>
          {mostrarCalendario && (
            <DateTimePicker
              value={fecha}
              mode="date"
              maximumDate={new Date()}
              onChange={(evento, seleccionada) => {
                setMostrarCalendario(false);
                if (seleccionada) setFecha(seleccionada);
              }}
            />
          )}

          <Text style={{ fontSize: 13, fontWeight: '700', color: colores.etiqueta, marginBottom: 8 }}>
            Descripción
          </Text>
          <TextInput
            value={observacion}
            onChangeText={setObservacion}
            placeholder="Ejemplo: Hoy limpié el tanque"
            placeholderTextColor={colores.textoSecundario}
            multiline
            numberOfLines={4}
            editable={!ocupado}
            style={{
              backgroundColor: FONDO_CAMPO,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
              fontSize: 15,
              color: colores.texto,
              minHeight: 90,
              textAlignVertical: 'top',
              marginBottom: 18,
            }}
          />

          <Text style={{ fontSize: 13, fontWeight: '700', color: colores.etiqueta, marginBottom: 8 }}>
            Tipo de entrada
          </Text>
          <Pressable
            onPress={() => !ocupado && tiposEvento.length > 0 && setSelectorAbierto((a) => !a)}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: FONDO_CAMPO,
              borderRadius: 14,
              paddingHorizontal: 16,
              paddingVertical: 14,
              marginBottom: selectorAbierto ? 0 : 18,
            }}
          >
            <Text style={{ fontSize: 15, color: colores.texto, fontWeight: '600' }}>{nombreTipoActual}</Text>
            <Ionicons name={selectorAbierto ? 'chevron-up' : 'chevron-down'} size={18} color={colores.textoSecundario} />
          </Pressable>
          {selectorAbierto && (
            <View
              style={{
                marginTop: 6,
                marginBottom: 18,
                backgroundColor: colores.blanco,
                borderWidth: 1,
                borderColor: colores.borde,
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              {tiposEvento.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    setTipoEventoId(t.id);
                    setSelectorAbierto(false);
                  }}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    backgroundColor: t.id === tipoEventoId ? colores.acentoSuave : colores.blanco,
                  }}
                >
                  <Text style={{ fontSize: 15, color: colores.texto }}>{t.nombre}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={{ fontSize: 13, fontWeight: '700', color: colores.etiqueta, marginBottom: 8 }}>Fotos</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            {fotosExistentes.map((foto) => (
              <View key={foto.id} style={{ width: 72, height: 72 }}>
                <Image source={{ uri: foto.url }} style={{ width: 72, height: 72, borderRadius: 14 }} />
                <Pressable
                  onPress={() => quitarFotoExistente(foto.id)}
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    backgroundColor: colores.error,
                    borderRadius: 10,
                    width: 20,
                    height: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="close" size={14} color={colores.blanco} />
                </Pressable>
              </View>
            ))}
            {fotosNuevas.map((foto) => (
              <View key={foto.uri} style={{ width: 72, height: 72 }}>
                <Image source={{ uri: foto.uri }} style={{ width: 72, height: 72, borderRadius: 14 }} />
                <Pressable
                  onPress={() => quitarFotoNueva(foto.uri)}
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    backgroundColor: colores.error,
                    borderRadius: 10,
                    width: 20,
                    height: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="close" size={14} color={colores.blanco} />
                </Pressable>
              </View>
            ))}
            {totalFotos < MAX_FOTOS && (
              <Pressable
                onPress={agregarFotos}
                disabled={ocupado}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: FONDO_CAMPO,
                  opacity: ocupado ? 0.6 : 1,
                }}
              >
                <Ionicons name="image-outline" size={26} color={colores.texto} />
                <Ionicons name="add" size={14} color={colores.texto} style={{ position: 'absolute', bottom: 8, right: 8 }} />
              </Pressable>
            )}
          </View>

          {error && <MensajeError texto={error} />}

          <Boton
            texto="Confirmar"
            onPress={manejarGuardar}
            cargando={guardando}
            disabled={procesandoFoto || eliminando || tipoEventoId === null}
            variante="primario"
          />

          {editando && (
            <Boton
              texto="Eliminar entrada"
              onPress={manejarEliminar}
              cargando={eliminando}
              disabled={procesandoFoto || guardando}
              variante="peligro"
            />
          )}
        </ScrollView>
      </View>
    </View>
  );
}
