import { useCallback, useState, type ReactNode } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../apiClient';
import { eliminarAcuario, obtenerAcuario } from './api';
import { calcularEstado, COLOR_ESTADO, textoEstado } from './estado';
import { colores } from '../ui/colores';
import type { AcuarioTabParamList, ApplicationStackParamList } from '../navigation/types';

type Navegacion = BottomTabNavigationProp<AcuarioTabParamList, 'Configuracion'>;
type StackNavegacion = NativeStackNavigationProp<ApplicationStackParamList>;
type Ruta = RouteProp<AcuarioTabParamList, 'Configuracion'>;

function proximamente() {
  Alert.alert('Próximamente', 'Esta función todavía no está disponible.');
}

export function ConfiguracionAcuarioScreen() {
  const { accessToken } = useAuth();
  const navigation = useNavigation<Navegacion>();
  const { params } = useRoute<Ruta>();
  const insets = useSafeAreaInsets();
  const [acuario, setAcuario] = useState(params.acuario);
  const estado = calcularEstado(acuario);

  const refrescarAcuario = useCallback(async () => {
    if (!accessToken) return;
    try {
      setAcuario(await obtenerAcuario(accessToken, acuario.id));
    } catch {
    }
  }, [accessToken, acuario.id]);

  useFocusEffect(
    useCallback(() => {
      refrescarAcuario();
    }, [refrescarAcuario])
  );

  function manejarEliminar() {
    Alert.alert(
      'Eliminar acuario',
      `¿Seguro que querés eliminar "${acuario.nombre}"? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            if (!accessToken) return;
            try {
              await eliminarAcuario(accessToken, acuario.id);
              navigation.getParent()?.goBack();
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
      <View style={{backgroundColor: COLOR_ESTADO[estado]}}>
      <View
        style={{
          height: 100 + insets.top,
          backgroundColor: colores.acento,
          borderBottomRightRadius: 56,
          overflow: 'hidden',
        }}
      >
        <View style={{height: 30, width: '100%', backgroundColor: '#014c7d'}}/>
        <Image
          source={require('../../assets/SUPazul.png')}
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
      <View style={{ backgroundColor: COLOR_ESTADO[estado], paddingVertical: 8, alignItems: 'center' }}>
        <Text
          style={{
            color: estado === 'manual' ? colores.texto : colores.blanco,
            fontSize: 13,
            fontWeight: '700',
          }}
        >
          {textoEstado(estado, acuario)}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 24 }}>
        <SeccionMenu titulo="Acuario">
          <FilaMenu
            icono="create-outline"
            etiqueta="Editar nombre"
            onPress={() => navigation.getParent<StackNavegacion>()?.navigate('EditarNombreAcuario', { acuario })}
          />
          <FilaMenu icono="notifications-outline" etiqueta="Rangos y alertas" onPress={proximamente} ultima />
        </SeccionMenu>

        <SeccionMenu titulo="Dispositivos">
          <FilaMenu
            icono="link-outline"
            etiqueta="Vincular o desvincular"
            onPress={() =>
              acuario.dispositivo_id
                ? navigation.getParent<StackNavegacion>()?.navigate('DesvincularDispositivo', { acuario })
                : navigation.getParent<StackNavegacion>()?.navigate('VincularDispositivo', { acuario })
            }
          />
          <FilaMenu icono="options-outline" etiqueta="Calibrar un sensor" onPress={proximamente} />
          <FilaMenu icono="trash-outline" etiqueta="Eliminar acuario" onPress={manejarEliminar} ultima />
        </SeccionMenu>
      </ScrollView>
    </View>
  );
}

function SeccionMenu({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontSize: 15, fontWeight: '800', color: colores.texto }}>{titulo}</Text>
      <View
        style={{
          backgroundColor: colores.blanco,
          borderRadius: 14,
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        }}
      >
        {children}
      </View>
    </View>
  );
}

function FilaMenu({
  icono,
  etiqueta,
  onPress,
  ultima = false,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  etiqueta: string;
  onPress: () => void;
  ultima?: boolean;
}) {
  return (
    <>
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
      }}
    >
      <Ionicons name={icono} size={20} color={colores.texto} />
      <Text style={{ flex: 1, fontSize: 14.5, fontWeight: '600', color: colores.texto }}>{etiqueta}</Text>
      <Ionicons name="chevron-forward" size={18} color={colores.textoSecundario} />
      
    </Pressable>
    <View style={{width: '90%', height: ultima ? 0 : 1, backgroundColor: colores.borde, alignSelf: 'center'}}/>
    </>
  );
}
