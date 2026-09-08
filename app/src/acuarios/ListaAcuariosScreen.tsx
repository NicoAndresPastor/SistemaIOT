import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../apiClient';
import { listarAcuarios, type Acuario } from './api';
import { calcularEstado, COLOR_ESTADO, textoEstado } from './estado';
import { colores } from '../ui/colores';
import type { ApplicationStackParamList } from '../navigation/types';

type Navegacion = NativeStackNavigationProp<ApplicationStackParamList, 'Home'>;

export function ListaAcuariosScreen() {
  const { accessToken } = useAuth();
  const navigation = useNavigation<Navegacion>();
  const insets = useSafeAreaInsets();
  const [acuarios, setAcuarios] = useState<Acuario[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(
    async (esRefresco = false) => {
      if (!accessToken) return;
      if (esRefresco) setRefrescando(true);
      setError(null);
      try {
        const datos = await listarAcuarios(accessToken);
        setAcuarios(datos);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor');
      } finally {
        setRefrescando(false);
      }
    },
    [accessToken]
  );

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

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
          <Text style={{ color: colores.blanco, fontSize: 24, fontWeight: '800' }}>Mis acuarios</Text>
        </View>
        <Pressable
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: colores.blanco,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onPress={() => navigation.navigate('MiCuenta')}
        >
          <Ionicons name="person" size={28} color={colores.acento} />
        </Pressable>
      </View>

      {acuarios === null && !error && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <ActivityIndicator size="large" color={colores.acento} />
        </View>
      )}

      {error && acuarios === null && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: colores.error, fontSize: 14, textAlign: 'center', marginBottom: 12 }}>{error}</Text>
          <Pressable onPress={() => cargar()}>
            <Text style={{ color: colores.acento, fontWeight: '700' }}>Reintentar</Text>
          </Pressable>
        </View>
      )}

      {acuarios !== null && (
        <FlatList
          data={acuarios}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, gap: 14, flexGrow: 1 }}
          refreshControl={
            <RefreshControl refreshing={refrescando} onRefresh={() => cargar(true)} tintColor={colores.acento} />
          }
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 6 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colores.texto }}>Todavía no tenés acuarios</Text>
              <Text style={{ fontSize: 13, color: colores.textoSecundario }}>Tocá el botón + para crear el primero.</Text>
            </View>
          }
          ListFooterComponent={acuarios.length > 0 ? <ReferenciaEstados /> : null}
          renderItem={({ item }) => (
            <TarjetaAcuario acuario={item} onPress={() => navigation.navigate('AcuarioTabs', { acuario: item })} />
          )}
        />
      )}

      <Pressable
        style={{
          position: 'absolute',
          marginRight:6, 
          right: 20,
          bottom: 28,
          width: 68,
          height: 68,
          borderRadius: 50,
          backgroundColor: colores.acento,
          alignItems: 'center',
          justifyContent: 'center',
          elevation: 4,
        }}
        onPress={() => navigation.navigate('CrearAcuario')}
      >
        <Text style={{ color: colores.blanco, fontSize: 40, fontWeight: '800', marginTop: -2 }}>+</Text>
      </Pressable>
    </View>
  );
}

interface ValorMedicion {
  etiqueta: string;
  fueraDeRango: boolean;
}

function construirValores(acuario: Acuario): ValorMedicion[] {
  const valores: ValorMedicion[] = [];
  if (acuario.temperatura !== null) {
    valores.push({ etiqueta: `${acuario.temperatura} °C`, fueraDeRango: !!acuario.temperatura_fuera_de_rango });
  }
  if (acuario.ph !== null) {
    valores.push({ etiqueta: `${acuario.ph} pH`, fueraDeRango: !!acuario.ph_fuera_de_rango });
  }
  if (acuario.conductividad !== null) {
    valores.push({ etiqueta: `${acuario.conductividad} µS/cm`, fueraDeRango: !!acuario.conductividad_fuera_de_rango });
  }
  return valores;
}

function TarjetaAcuario({ acuario, onPress }: { acuario: Acuario; onPress: () => void }) {
  const estado = calcularEstado(acuario);
  const valores = construirValores(acuario);

  return (
    <Pressable
      style={{
        flexDirection: 'row',
        marginRight:6,
        marginLeft:6,
        backgroundColor: '#F4F1EC',
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}
      onPress={onPress}
    >
      <View style={{ width: 20, backgroundColor: COLOR_ESTADO[estado] }} />
      <View style={{ flex: 1, padding: 16, gap: 4 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colores.texto }}>{acuario.nombre}</Text>
        {valores.length > 0 ? (
          <Text style={{ fontSize: 13, color: colores.etiqueta }}>
            {valores.map((valor, i) => (
              <Text key={i}>
                <Text style={valor.fueraDeRango ? { color: colores.estadoAlerta, fontWeight: '700' } : undefined}>
                  {valor.etiqueta}
                </Text>
                {i < valores.length - 1 ? '  -  ' : ''}
              </Text>
            ))}
          </Text>
        ) : (
          <Text style={{ fontSize: 13, color: colores.textoSecundario }}>Sin mediciones todavía</Text>
        )}
        <Text style={{ fontSize: 12, color: colores.textoSecundario, marginTop: 2 }}>
          {textoEstado(estado, acuario)}
        </Text>
      </View>
    </Pressable>
  );
}

function ReferenciaEstados() {
  const filas: { color: string; borde?: string; texto: string }[] = [
    { color: colores.estadoOk, texto: 'Ningún parámetro fuera de rango' },
    { color: colores.estadoAlerta, texto: 'Algún parámetro fuera de rango' },
    { color: colores.textoOscuro, texto: 'Sin comunicación con el dispositivo' },
    { color: colores.blanco, borde: colores.borde, texto: 'Carga manual' },
  ];

  return (
    <View style={{marginLeft:7, marginTop: 8, gap: 10 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colores.texto, marginBottom: 2 }}>
        Referencia de estados
      </Text>
      {filas.map((fila) => (
        <View key={fila.texto} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={[
              { width: 10, height: 10, borderRadius: 5, backgroundColor: fila.color },
              fila.borde ? { borderWidth: 1, borderColor: fila.borde } : null,
            ]}
          />
          <Text style={{ fontSize: 12, color: colores.textoSecundario }}>{fila.texto}</Text>
        </View>
      ))}
    </View>
  );
}
