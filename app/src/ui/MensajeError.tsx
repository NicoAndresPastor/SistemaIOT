import { StyleSheet, Text } from 'react-native';
import { colores } from './colores';

export function MensajeError({ texto }: { texto: string }) {
  return <Text style={estilos.texto}>{texto}</Text>;
}

const estilos = StyleSheet.create({
  texto: { color: colores.error, fontSize: 13, marginBottom: 4 },
});
