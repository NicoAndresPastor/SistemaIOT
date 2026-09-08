import { ActivityIndicator, Pressable, StyleSheet, Text, type TextStyle, type ViewStyle } from 'react-native';
import { colores } from './colores';

type Variante = 'primario' | 'peligro' | 'secundario' | 'formulario';

interface Props {
  texto: string;
  onPress: () => void;
  cargando?: boolean;
  disabled?: boolean;
  variante?: Variante;
}

export function Boton({ texto, onPress, cargando = false, disabled = false, variante = 'primario' }: Props) {
  const inactivo = cargando || disabled;
  return (
    <Pressable
      style={[estilos.base, estilosContenedor[variante], inactivo && estilos.inactivo]}
      onPress={onPress}
      disabled={inactivo}
    >
      {cargando ? (
        <ActivityIndicator color={variante === 'primario' || variante === 'formulario' ? colores.blanco : colores.acento} />
      ) : (
        <Text style={[estilos.texto, estilosTexto[variante]]}>{texto}</Text>
      )}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  base: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  inactivo: { opacity: 0.6 },
  texto: { fontSize: 15, fontWeight: '700' },
});

const estilosContenedor: Record<Variante, ViewStyle> = {
  primario: { backgroundColor: colores.acento },
  peligro: { borderWidth: 1, borderColor: colores.error, backgroundColor: 'transparent' },
  secundario: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde },
  formulario: { backgroundColor: colores.acentoFormulario },
};

const estilosTexto: Record<Variante, TextStyle> = {
  primario: { color: colores.blanco },
  peligro: { color: colores.error },
  secundario: { color: colores.texto },
  formulario: { color: colores.blanco },
};
