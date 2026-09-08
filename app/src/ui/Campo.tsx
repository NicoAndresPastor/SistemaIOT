import { StyleSheet, Text, TextInput, View, type TextInputProps, type StyleProp, type ViewStyle } from 'react-native';
import { colores } from './colores';

interface Props extends TextInputProps {
  etiqueta: string;
  ayuda?: string;
  claro?: boolean;
  estiloContenedor?: StyleProp<ViewStyle>;
}

export function Campo({ etiqueta, ayuda, claro = false, estiloContenedor, style, ...resto }: Props) {
  return (
    <View style={[estilos.contenedor, estiloContenedor]}>
      <Text style={[estilos.etiqueta, claro && estilos.etiquetaClara]}>{etiqueta}</Text>
      <TextInput style={[estilos.input, style]} placeholderTextColor={colores.textoSecundario} {...resto} />
      {ayuda && <Text style={[estilos.ayuda, claro && estilos.ayudaClara]}>{ayuda}</Text>}
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { marginBottom: 16, gap: 6 },
  etiqueta: { fontSize: 13, fontWeight: '700', color: colores.etiqueta },
  etiquetaClara: { color: colores.blanco },
  input: {
    backgroundColor: colores.blanco,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: colores.texto,
  },
  ayuda: { fontSize: 12, color: colores.textoSecundario },
  ayudaClara: { color: colores.textoOscuro },
});
