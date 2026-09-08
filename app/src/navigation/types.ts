import type { Acuario } from '../acuarios/api';

export type AuthStackParamList = {
  Login: undefined;
  Registro: undefined;
};

export type ApplicationStackParamList = {
  Home: undefined;
  CrearAcuario: undefined;
  AcuarioTabs: { acuario: Acuario };
  EditarNombreAcuario: { acuario: Acuario };
  VincularDispositivo: { acuario: Acuario };
  DesvincularDispositivo: { acuario: Acuario };
  MiCuenta: undefined;
};

export type AcuarioTabParamList = {
  Home: { acuario: Acuario };
  Historial: undefined;
  Bitacora: undefined;
  Enchufes: undefined;
  Configuracion: { acuario: Acuario };
};
