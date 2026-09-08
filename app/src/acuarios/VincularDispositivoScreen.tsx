import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../apiClient';
import { vincularDispositivo } from './api';
import { Campo } from '../ui/Campo';
import { Boton } from '../ui/Boton';
import { MensajeError } from '../ui/MensajeError';
import { colores } from '../ui/colores';
import type { ApplicationStackParamList } from '../navigation/types';

type Navegacion = NativeStackNavigationProp<ApplicationStackParamList, 'VincularDispositivo'>;
type Ruta = RouteProp<ApplicationStackParamList, 'VincularDispositivo'>;

export function VincularDispositivoScreen() {
  const { accessToken } = useAuth();
  const navigation = useNavigation<Navegacion>();
  const { params } = useRoute<Ruta>();
  const insets = useSafeAreaInsets();
  const acuario = params.acuario;

  const [identificadorHardware, setIdentificadorHardware] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function manejarSubmit() {
    setError(null);
    if (!identificadorHardware.trim()) {
      setError('Ingresá el identificador de la placa');
      return;
    }
    if (!accessToken) return;
    setEnviando(true);
    try {
      await vincularDispositivo(accessToken, acuario.id, identificadorHardware.trim());
      navigation.goBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor');
    } finally {
      setEnviando(false);
    }
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

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flex: 1, padding: 20, paddingTop: 24 }}>
          <Campo
            etiqueta="Introduzca el identificador"
            placeholder="ESP32-XXXX-001"
            value={identificadorHardware}
            onChangeText={setIdentificadorHardware}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!enviando}
          />
          {error && <MensajeError texto={error} />}
          <Boton texto="Vincular" onPress={manejarSubmit} cargando={enviando} variante="formulario" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
    </>
  );
}
