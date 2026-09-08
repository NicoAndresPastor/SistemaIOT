import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useAuth } from '../auth/AuthContext';
import { obtenerAcuario } from './api';
import { calcularEstado, COLOR_ESTADO, textoEstado } from './estado';
import { formatearTiempoRelativo } from '../ui/tiempo';
import { colores } from '../ui/colores';
import type { AcuarioTabParamList } from '../navigation/types';

const INTERVALO_REFRESCO_MS = 30 * 1000;

type Navegacion = BottomTabNavigationProp<AcuarioTabParamList, 'Home'>;
type Ruta = RouteProp<AcuarioTabParamList, 'Home'>;

export function HomeAcuarioScreen() {
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
      const intervalo = setInterval(refrescarAcuario, INTERVALO_REFRESCO_MS);
      return () => clearInterval(intervalo);
    }, [refrescarAcuario])
  );

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
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colores.texto }}>Parámetros</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <TarjetaParametro
              etiqueta="Temperatura"
              valor={acuario.temperatura}
              unidad="°C"
              marcaTemporal={acuario.temperatura_marca_temporal}
              fueraDeRango={!!acuario.temperatura_fuera_de_rango}
            />
            <TarjetaParametro
              etiqueta="pH"
              valor={acuario.ph}
              unidad=""
              marcaTemporal={acuario.ph_marca_temporal}
              fueraDeRango={!!acuario.ph_fuera_de_rango}
            />
            <TarjetaParametro
              etiqueta="Conductividad"
              valor={acuario.conductividad}
              unidad="uS"
              marcaTemporal={acuario.conductividad_marca_temporal}
              fueraDeRango={!!acuario.conductividad_fuera_de_rango}
            />
          </View>
        </View>

        <SeccionEnchufesMock />
        <SeccionRecomendacionesMock />
      </ScrollView>
    </View>
  );
}

function TarjetaParametro({
  etiqueta,
  valor,
  unidad,
  marcaTemporal,
  fueraDeRango,
}: {
  etiqueta: string;
  valor: number | null;
  unidad: string;
  marcaTemporal: string | null;
  fueraDeRango: boolean;
}) {
  return (
    <View
      style={{
        width: '47%',
        backgroundColor: fueraDeRango ? '#F8C9CC' : colores.blanco,
        borderRadius: 14,
        padding: 14,
        gap: 4,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 9,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '700', color: colores.textoSecundario }}>{etiqueta}</Text>
      {valor !== null ? (
        <Text style={{ fontSize: 22, fontWeight: '800', color: colores.texto }}>
          {valor}
          {unidad ? ` ${unidad}` : ''}
        </Text>
      ) : (
        <Text style={{ fontSize: 14, fontWeight: '700', color: colores.textoSecundario }}>Sin datos</Text>
      )}
      {fueraDeRango && <Text style={{ fontSize: 11, color: colores.estadoAlerta, fontWeight: '700' }}>Fuera de rango</Text>}
      <Text style={{ fontSize: 11, color: colores.textoSecundario }}>{formatearTiempoRelativo(marcaTemporal)}</Text>
    </View>
  );
}

function SeccionEnchufesMock() {
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontSize: 15, fontWeight: '800', color: colores.texto }}>Enchufes</Text>
      <FilaEnchufeMock icono="bulb-outline" etiqueta="Luz" prendido={true} />
      <FilaEnchufeMock icono="thermometer-outline" etiqueta="Calentador" prendido={false} />
    </View>
  );
}

function FilaEnchufeMock({
  icono,
  etiqueta,
  prendido,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  etiqueta: string;
  prendido: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colores.blanco,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 16,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name={icono} size={20} color={colores.texto} />
        <Text style={{ fontSize: 14, fontWeight: '600', color: colores.texto }}>{etiqueta}</Text>
      </View>
      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 4,
          borderRadius: 12,
          backgroundColor: prendido ? colores.acento : colores.borde,
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontWeight: '700',
            color: prendido ? colores.blanco : colores.textoSecundario,
          }}
        >
          {prendido ? 'ON' : 'OFF'}
        </Text>
      </View>
    </View>
  );
}

function SeccionRecomendacionesMock() {
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontSize: 15, fontWeight: '800', color: colores.texto }}>Recomendaciones activas</Text>
      <View
        style={{
          flexDirection: 'row',
          gap: 10,
          backgroundColor: colores.acentoSuave,
          borderRadius: 14,
          padding: 14,
        }}
      >
        <Ionicons name="information-circle-outline" size={20} color={colores.acento} />
        <Text style={{ flex: 1, fontSize: 13, color: colores.textoOscuro, lineHeight: 18 }}>
          Revisá el nivel de CO2. El pH alto puede indicar que existe un exceso de carbonatos.
        </Text>
      </View>
    </View>
  );
}

