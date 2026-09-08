import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../apiClient';
import { desvincularDispositivo } from './api';
import { Boton } from '../ui/Boton';
import { MensajeError } from '../ui/MensajeError';
import { formatearTiempoRelativo } from '../ui/tiempo';
import { colores } from '../ui/colores';
import type { ApplicationStackParamList } from '../navigation/types';

type Navegacion = NativeStackNavigationProp<ApplicationStackParamList, 'DesvincularDispositivo'>;
type Ruta = RouteProp<ApplicationStackParamList, 'DesvincularDispositivo'>;

export function DesvincularDispositivoScreen() {
  const { accessToken } = useAuth();
  const navigation = useNavigation<Navegacion>();
  const { params } = useRoute<Ruta>();
  const insets = useSafeAreaInsets();
  const acuario = params.acuario;

  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function manejarSubmit() {
    setError(null);
    Alert.alert('Desvincular dispositivo', '¿Seguro que querés desvincular este dispositivo del acuario?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desvincular',
        style: 'destructive',
        onPress: async () => {
          if (!accessToken) return;
          setEnviando(true);
          try {
            await desvincularDispositivo(accessToken, acuario.id);
            navigation.goBack();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor');
          } finally {
            setEnviando(false);
          }
        },
      },
    ]);
  }

  return (
        <>


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
                    {acuario.nombre}
                  </Text>
                </Pressable>
                  <Image source={require('../../assets/LOGO.png')} style={{ right: 20, width: 52, height: 52 }} resizeMode="contain" />
              </View>
            </View>       
            
          </View>
      <ScrollView  contentContainerStyle={{ flex: 1, padding: 20, paddingTop: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colores.etiqueta, marginBottom: 8 }}>
          Dispositivo vinculado
        </Text>
        <Text style={{ fontSize: 17, color: colores.texto, paddingTop: 16 }}>{acuario.identificador_hardware ?? 'Desconocido'}</Text>
        <Text style={{ fontSize: 14.5, color: colores.textoSecundario, marginBottom: 20 }}>
          Última comunicación: {formatearTiempoRelativo(acuario.ultima_comunicacion)}
        </Text>

        {error && <MensajeError texto={error} />}
        <Boton texto="Desvincular" onPress={manejarSubmit} cargando={enviando} variante="peligro" />
      </ScrollView>
    </View>
    </>
  );
}
