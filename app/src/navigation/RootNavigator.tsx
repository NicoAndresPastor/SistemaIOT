import { useAuth } from '../auth/AuthContext';
import { PantallaCargando } from '../ui/PantallaCargando';
import { AuthNavigator } from './AuthNavigator';
import { ApplicationNavigator } from './ApplicationNavigator';

export function RootNavigator() {
  const { accessToken, restaurandoSesion } = useAuth();

  if (restaurandoSesion) {
    return <PantallaCargando />;
  }

  return accessToken ? <ApplicationNavigator /> : <AuthNavigator />;
}
