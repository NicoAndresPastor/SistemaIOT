import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../auth/LoginScreen';
import { RegistroScreen } from '../auth/RegistroScreen';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Registro" component={RegistroScreen} />
    </Stack.Navigator>
  );
}
