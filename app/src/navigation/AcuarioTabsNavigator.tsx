import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { HomeAcuarioScreen } from '../acuarios/HomeAcuarioScreen';
import { ConfiguracionAcuarioScreen } from '../acuarios/ConfiguracionAcuarioScreen';
import { colores } from '../ui/colores';
import type { AcuarioTabParamList, ApplicationStackParamList } from './types';

const Tab = createBottomTabNavigator<AcuarioTabParamList>();

function PantallaInerte() {
  return null;
}

function iconoPestana(nombre: keyof typeof Ionicons.glyphMap) {
  return ({ focused, color, size }: { focused: boolean; color: string; size: number }) => {
    if (!focused) {
      return <Ionicons name={nombre} size={size} color={color} />;
    }
    return (
      <View
        style={{
          width: size + 20,
          height: size + 20,
          borderRadius: (size + 20) / 2,
          backgroundColor: colores.textoOscuro,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={nombre} size={size} color={colores.blanco} />
      </View>
    );
  };
}

const bloquearNavegacion = {
  tabPress: (e: { preventDefault: () => void }) => {
    e.preventDefault();
  },
};

export function AcuarioTabsNavigator() {
  const { params } = useRoute<RouteProp<ApplicationStackParamList, 'AcuarioTabs'>>();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: { backgroundColor: colores.acento, borderTopWidth: 0, height: 80, paddingTop: 16 ,borderTopLeftRadius: 20, borderTopRightRadius:20 },
        tabBarActiveTintColor: colores.blanco,
        tabBarInactiveTintColor: colores.blanco,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeAcuarioScreen}
        initialParams={{ acuario: params.acuario }}
        options={{ tabBarIcon: iconoPestana('home') }}
      />
      <Tab.Screen
        name="Historial"
        component={PantallaInerte}
        options={{ tabBarIcon: iconoPestana('bar-chart') }}
        listeners={bloquearNavegacion}
      />
      <Tab.Screen
        name="Bitacora"
        component={PantallaInerte}
        options={{ tabBarIcon: iconoPestana('book') }}
        listeners={bloquearNavegacion}
      />
      <Tab.Screen
        name="Enchufes"
        component={PantallaInerte}
        options={{ tabBarIcon: iconoPestana('flash') }}
        listeners={bloquearNavegacion}
      />
      <Tab.Screen
        name="Configuracion"
        component={ConfiguracionAcuarioScreen}
        initialParams={{ acuario: params.acuario }}
        options={{ tabBarIcon: iconoPestana('settings') }}
      />
    </Tab.Navigator>
  );
}
