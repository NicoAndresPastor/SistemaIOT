import type { Acuario, EntradaBitacora } from '../acuarios/api';

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
  CalibrarSensor: { acuario: Acuario };
  CrearEntradaBitacora: { acuario: Acuario; entrada?: EntradaBitacora };
  MiCuenta: undefined;
};

export type AcuarioTabParamList = {
  Home: { acuario: Acuario };
  Historial: undefined;
  Bitacora: { acuario: Acuario };
  Enchufes: { acuario: Acuario };
  Configuracion: { acuario: Acuario };
};
