import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ListaAcuariosScreen } from '../acuarios/ListaAcuariosScreen';
import { CrearAcuarioScreen } from '../acuarios/CrearAcuarioScreen';
import { EditarNombreAcuarioScreen } from '../acuarios/EditarNombreAcuarioScreen';
import { VincularDispositivoScreen } from '../acuarios/VincularDispositivoScreen';
import { DesvincularDispositivoScreen } from '../acuarios/DesvincularDispositivoScreen';
import { MiCuentaScreen } from '../auth/MiCuentaScreen';
import { colores } from '../ui/colores';
import { AcuarioTabsNavigator } from './AcuarioTabsNavigator';
import type { ApplicationStackParamList } from './types';

const Stack = createNativeStackNavigator<ApplicationStackParamList>();

export function ApplicationNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colores.fondo },
        headerShadowVisible: false,
        headerTintColor: colores.texto,
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="Home" component={ListaAcuariosScreen} options={{ headerShown: false }} />
      <Stack.Screen name="CrearAcuario" component={CrearAcuarioScreen} options={{ headerShown: false }} />
      <Stack.Screen name="AcuarioTabs" component={AcuarioTabsNavigator} options={{ headerShown: false }} />
      <Stack.Screen
        name="EditarNombreAcuario"
        component={EditarNombreAcuarioScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="VincularDispositivo"
        component={VincularDispositivoScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="DesvincularDispositivo"
        component={DesvincularDispositivoScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="MiCuenta" component={MiCuentaScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
