import { useCallback, useState } from 'react';
import { Image, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import { useAuth } from './AuthContext';
import { obtenerMiCuenta, eliminarCuenta, type MiCuenta } from './api';
import { ApiError } from '../apiClient';
import { colores } from '../ui/colores';
import type { ApplicationStackParamList } from '../navigation/types';

type Navegacion = NavigationProp<ApplicationStackParamList, 'MiCuenta'>;

const estiloFila = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 12,
  backgroundColor: colores.blanco,
  borderRadius: 14,
  padding: 16,
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};

export function MiCuentaScreen() {
  const { accessToken, cerrarSesion } = useAuth();
  const navigation = useNavigation<Navegacion>();
  const insets = useSafeAreaInsets();
  const [cuenta, setCuenta] = useState<MiCuenta | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!accessToken) return;
      obtenerMiCuenta(accessToken)
        .then(setCuenta)
        .catch(() => {
        });
    }, [accessToken])
  );

  function manejarEliminarCuenta() {
    Alert.alert(
      'Eliminar cuenta',
      'Esto borra tu cuenta y todos tus acuarios de forma permanente. Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            if (!accessToken) return;
            try {
              await eliminarCuenta(accessToken);
              await cerrarSesion();
            } catch (err) {
              Alert.alert('Error', err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor');
            }
          },
        },
      ]
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F4F1EC' }}>
            <View
        style={{
          backgroundColor: '#0281B8',
          borderBottomRightRadius: 56,
          overflow: 'hidden',
          paddingHorizontal: 24,
          paddingTop: 16 + insets.top,
          paddingBottom: 24,
          paddingRight:25,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <View
        style={{
          marginTop: 30 
        }}>
          <Pressable
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' }}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={24} color={colores.blanco} />
            <Text style={{ color: colores.blanco, fontSize: 24, fontWeight: '800' }}>Mi cuenta</Text>
          </Pressable> 
        </View>
        <Image source={require('../../assets/LOGO.png')} style={{ right: 20, width: 52, height: 52 }} resizeMode="contain" />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
        <View style={estiloFila}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colores.borde,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="person" size={22} color={colores.textoSecundario} />
          </View>
          <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '600', color: colores.texto }}>
            {cuenta?.email ?? '...'}
          </Text>
        </View>

        <Pressable style={estiloFila} onPress={cerrarSesion}>
          <Ionicons name="log-out-outline" size={22} color={colores.texto} />
          <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '600', color: colores.texto }}>Cerrar sesión</Text>
        </Pressable>

        <Pressable style={estiloFila} onPress={manejarEliminarCuenta}>
          <Ionicons name="trash-outline" size={22} color={colores.error} />
          <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '600', color: colores.error }}>
            Eliminar cuenta y datos
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
