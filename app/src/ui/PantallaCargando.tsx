import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colores } from './colores';

export function PantallaCargando() {
  return (
    <LinearGradient colors={[colores.gradienteInicio, colores.gradienteFin]} style={estilos.contenedor}>
      <View style={estilos.centro}>
        <Image source={require('../../assets/LOGOAQUORA.png')} style={estilos.logo} resizeMode="contain" />
        <Text style={estilos.tagline}>TU ACUARIO MÁS SEGURO</Text>
      </View>
      <Image source={require('../../assets/Group 36.png')} style={estilos.ondas} resizeMode="contain" />
    </LinearGradient>
  );
}

const estilos = StyleSheet.create({
  contenedor: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centro: {
    alignItems: 'center',
    gap: 4,
  },
  logo: {
    width: 220,
    height: 123,
  },
  tagline: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.5,
  },
  ondas: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: '100%',
    aspectRatio: 393 / 80,
  },
});
