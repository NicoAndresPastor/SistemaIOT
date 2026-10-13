#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#define MQTT_MAX_PACKET_SIZE 384
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <time.h>
#include <sys/time.h>
#include <Wire.h>
#include <U8g2lib.h>
#include <RTClib.h>
#include <LittleFS.h>
#include "config.h"

const int MQTT_PORT = 1883;
const long INTERVALO_MUESTREO_MS = 30000;
const unsigned long TIMEOUT_CONEXION_WIFI_MS = 30000;
const char* AP_SSID = "AcuarioIOT-Config";
const byte DNS_PORT = 53;

const int PIN_BOTON_RESET = 0;
const unsigned long BOTON_RESET_MANTENER_MS = 5000;

const int PIN_DS = 4;
const int PIN_TDS_PWR = 19;
const int PIN_TDS = 35;
const int PIN_PH = 32;

const int PIN_SDA = 21;
const int PIN_SCL = 22;
const uint8_t DIRECCION_DISPLAY = 0x3C;

const bool SIMULAR_SENSORES = false;

const unsigned long TIMEOUT_NTP_MS = 15000;
const unsigned long INTERVALO_REINTENTO_MQTT_INICIAL_MS = 1000;
const unsigned long INTERVALO_REINTENTO_MQTT_MAX_MS = 5UL * 60 * 1000;

const uint32_t CAPACIDAD_REGISTROS_PENDIENTES = 10000;
const char* ARCHIVO_PENDIENTES = "/pendientes.dat";

const float K_DIVISOR = 1800.0f / 2800.0f;
const uint32_t MS_ASENTAR_PH = 800;
const uint32_t MS_ASENTAR_TDS = 800;
const float PH_V_NEUTRO = 2.500f;
const float PH_V_POR_UNIDAD = 0.175f;

Preferences preferencias;
Preferences memoriaCal;
Preferences memoriaBuffer;
WebServer servidorConfig(80);
DNSServer dnsServer;
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
U8G2_SSD1306_128X64_NONAME_F_HW_I2C display(U8G2_R0, U8X8_PIN_NONE);
bool hayDisplay = false;
RTC_DS3231 rtc;
bool hayRtc = false;

unsigned long ultimoIntentoMqtt = 0;
unsigned long intervaloReintentoMqtt = INTERVALO_REINTENTO_MQTT_INICIAL_MS;

struct __attribute__((packed)) RegistroPendiente {
  uint32_t marcaTemporal;
  uint8_t parametro;
  float valor;
};

uint32_t bufferCabeza = 0;
uint32_t bufferCola = 0;
uint32_t bufferCantidad = 0;

OneWire oneWire(PIN_DS);
DallasTemperature ds(&oneWire);
DeviceAddress romDs;
bool hayDs = false;

bool enModoConfiguracion = false;

bool botonResetPresionado = false;
unsigned long inicioPresionBotonReset = 0;

float temperatura = NAN;
float ph = NAN;
float conductividad = NAN;

bool tempValida = false;
bool phValida = false;
bool condValida = false;

struct Calibracion {
  float x[3] = { 0, 0, 0 };
  float y[3] = { 0, 0, 0 };
  uint8_t n = 0;
};
Calibracion calTemp, calPh, calCond;

float ultimaTempOk = NAN;
float ultimoPo = 0;

unsigned long ultimoMuestreo = 0;

struct Historia {
  float v[6];
  uint8_t n = 0;
  void push(float x) { v[n % 6] = x; n++; }
  uint32_t rango() const {
    uint8_t c = n < 6 ? n : 6;
    if (c < 3) return 0;
    float mn = v[0], mx = v[0];
    for (uint8_t i = 1; i < c; i++) {
      if (v[i] < mn) mn = v[i];
      if (v[i] > mx) mx = v[i];
    }
    return (uint32_t)(mx - mn);
  }
};

Historia histTds, histPh;

void setup() {
  pinMode(PIN_TDS_PWR, OUTPUT);
  digitalWrite(PIN_TDS_PWR, LOW);

  Serial.begin(115200);
  pinMode(PIN_BOTON_RESET, INPUT_PULLUP);
  preferencias.begin("wifi", false);
  iniciarSensores();
  Wire.begin(PIN_SDA, PIN_SCL);
  iniciarRtc();
  iniciarDisplay();
  iniciarBufferPendientes();

  String ssidGuardado = preferencias.getString("ssid", "");
  if (ssidGuardado == "") {
    iniciarModoConfiguracion();
  } else {
    conectarWifiGuardado();
  }
}

void loop() {
  revisarBotonReset();
  atenderComandosSerie();

  if (enModoConfiguracion) {
    dnsServer.processNextRequest();
    servidorConfig.handleClient();
    return;
  }

  if (!mqttClient.connected()) {
    intentarConectarMqtt();
  }
  mqttClient.loop();

  if (mqttClient.connected() && bufferCantidad > 0) {
    reenviarPendientes(5);
  }

  if (millis() - ultimoMuestreo >= INTERVALO_MUESTREO_MS) {
    ultimoMuestreo = millis();
    leerSensores();
    publicarOGuardarLecturas();
    mostrarEnDisplay();
  }
}

void revisarBotonReset() {
  bool presionadoAhora = (digitalRead(PIN_BOTON_RESET) == LOW);

  if (!presionadoAhora) {
    botonResetPresionado = false;
    return;
  }

  if (!botonResetPresionado) {
    botonResetPresionado = true;
    inicioPresionBotonReset = millis();
    return;
  }

  unsigned long tiempoPresionado = millis() - inicioPresionBotonReset;
  if (tiempoPresionado >= BOTON_RESET_MANTENER_MS) {
    Serial.println("Boton mantenido presionado: borrando WiFi guardado...");
    preferencias.clear();
    ESP.restart();
  }
}

void iniciarModoConfiguracion() {
  enModoConfiguracion = true;
  Serial.println("Sin WiFi guardado. Iniciando modo configuracion...");

  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID);

  dnsServer.start(DNS_PORT, "*", WiFi.softAPIP());

  Serial.print("Conectate desde tu celular a la red \"");
  Serial.print(AP_SSID);
  Serial.println("\" -- deberia abrirse el formulario solo");

  servidorConfig.on("/", HTTP_GET, mostrarFormulario);
  servidorConfig.on("/guardar", HTTP_POST, guardarCredenciales);
  servidorConfig.onNotFound(mostrarFormulario);
  servidorConfig.begin();

  mostrarMensajeEnDisplay("Configurar WiFi", "Conectate a la red", AP_SSID);
}

String paginaBase(String estilosExtra, String cuerpoExtra) {
  String html =
    "<!DOCTYPE html><html><head>"
    "<meta name='viewport' content='width=device-width, initial-scale=1'>"
    "<style>"
    "*{box-sizing:border-box;margin:0;padding:0;}"
    "body{font-family:-apple-system,Helvetica,Arial,sans-serif;"
    "background:linear-gradient(180deg,#A9D3E5 0%,#4A8FC2 100%);"
    "min-height:100vh;display:flex;flex-direction:column;"
    "align-items:center;padding:48px 28px;}"
    ".logo{width:160px;margin-bottom:8px;}";
  html += estilosExtra;
  html +=
    "</style></head><body>";
  html +=
      "<img class='logo' alt='AQUORA' src='data:image/png;base64,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"
      "' />";
  html += cuerpoExtra;
  html += "</body></html>";
  return html;
}

void mostrarFormulario() {
  String estilos =
    "p.sub{color:#1c3a4a;font-size:14px;text-align:center;line-height:1.4;"
    "margin-bottom:48px;max-width:260px;}"
    "form{width:100%;max-width:280px;}"
    "label{display:block;color:white;font-size:14px;font-weight:600;"
    "margin-bottom:8px;}"
    "input{width:100%;padding:14px 16px;border:none;border-radius:10px;"
    "font-size:15px;margin-bottom:24px;background:white;color:#1c3a4a;}"
    "input:focus{outline:2px solid white;}"
    "button{width:100%;padding:16px;border:none;border-radius:12px;"
    "background:#3D7CB8;color:white;font-size:16px;font-weight:700;"
    "margin-top:8px;}";
  String cuerpo =
    "<p class='sub'>Introduzca el nombre de la red y su contrase&ntilde;a "
    "para continuar</p>"
    "<form action='/guardar' method='POST'>"
    "<label>Nombre de la red</label>"
    "<input name='ssid' type='text' autocapitalize='off' autocorrect='off'>"
    "<label>Contrase&ntilde;a</label>"
    "<input name='password' type='password'>"
    "<button type='submit'>Aceptar</button>"
    "</form>";
  servidorConfig.send(200, "text/html", paginaBase(estilos, cuerpo));
}

void guardarCredenciales() {
  String ssid = servidorConfig.arg("ssid");
  String password = servidorConfig.arg("password");

  preferencias.putString("ssid", ssid);
  preferencias.putString("password", password);

  String estilos =
    "p.estado{color:white;font-size:15px;font-weight:600;"
    "text-align:center;margin-top:56px;}";
  String cuerpo = "<p class='estado'>Estableciendo conexi&oacute;n ...</p>";
  servidorConfig.send(200, "text/html", paginaBase(estilos, cuerpo));

  delay(2000);
  ESP.restart();
}

void conectarWifiGuardado() {
  String ssid = preferencias.getString("ssid", "");
  String password = preferencias.getString("password", "");

  Serial.print("Conectando a WiFi guardado: ");
  Serial.println(ssid);
  mostrarMensajeEnDisplay("Conectando a WiFi", ssid.c_str(), "");

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), password.c_str());

  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED) {
    revisarBotonReset();
    delay(500);
    Serial.print(".");
    if (millis() - inicio > TIMEOUT_CONEXION_WIFI_MS) {
      Serial.println();
      Serial.println("No se pudo conectar. Reintentando...");
      ESP.restart();
      return;
    }
  }

  Serial.println();
  Serial.print("Conectado. IP asignada a la placa: ");
  Serial.println(WiFi.localIP());

  sincronizarHora();
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(manejarMensajeMqtt);
}

void sincronizarHora() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("Sincronizando hora por NTP");
  unsigned long inicio = millis();
  time_t ahora = time(nullptr);
  while (ahora < 1700000000) {
    if (millis() - inicio > TIMEOUT_NTP_MS) {
      Serial.println();
      if (hayRtc) {
        struct timeval tv = { (time_t)rtc.now().unixtime(), 0 };
        settimeofday(&tv, nullptr);
        Serial.println("Sin NTP: se tomo la hora del modulo RTC");
      } else {
        Serial.println("Sin NTP y sin RTC: las mediciones quedaran sin hora valida");
      }
      return;
    }
    delay(500);
    Serial.print(".");
    ahora = time(nullptr);
  }
  Serial.println();
  Serial.println("Hora sincronizada correctamente por NTP");
  if (hayRtc) rtc.adjust(DateTime((uint32_t)ahora));
}

void intentarConectarMqtt() {
  if (millis() - ultimoIntentoMqtt < intervaloReintentoMqtt) return;
  ultimoIntentoMqtt = millis();

  Serial.print("Conectando a MQTT...");
  String clientId = "ESP32-" + String(IDENTIFICADOR_HARDWARE);
  if (mqttClient.connect(clientId.c_str())) {
    Serial.println(" conectado");
    String topicComando = "acuarios/" + String(IDENTIFICADOR_HARDWARE) + "/calibracion/comando";
    mqttClient.subscribe(topicComando.c_str());
    intervaloReintentoMqtt = INTERVALO_REINTENTO_MQTT_INICIAL_MS;
    if (bufferCantidad > 0) {
      Serial.printf("Conexion restablecida: enviando %u lecturas pendientes\n", bufferCantidad);
    }
  } else {
    Serial.print(" fallo, codigo=");
    Serial.print(mqttClient.state());
    intervaloReintentoMqtt = min(intervaloReintentoMqtt * 2, INTERVALO_REINTENTO_MQTT_MAX_MS);
    Serial.printf(" -- reintentando en %lus\n", intervaloReintentoMqtt / 1000);
  }
}

float leerMv(int pin, int n, uint32_t &mn, uint32_t &mx) {
  uint32_t suma = 0;
  mn = 4095;
  mx = 0;
  for (int i = 0; i < n; i++) {
    uint32_t m = analogReadMilliVolts(pin);
    suma += m;
    if (m < mn) mn = m;
    if (m > mx) mx = m;
    delay(2);
  }
  return suma / (float)n;
}

float usPorCmDesde(float mv, float tempC) {
  float v = mv / 1000.0f;
  float coef = 1.0f + 0.02f * (tempC - 25.0f);
  float vc = v / coef;
  return 133.42f * vc * vc * vc - 255.86f * vc * vc + 857.39f * vc;
}

float phNominal(float po, float tempC) {
  float tK = (isnan(tempC) ? 25.0f : tempC) + 273.15f;
  float sT = PH_V_POR_UNIDAD * tK / 298.15f;
  return 7.0f + (PH_V_NEUTRO - po) / sT;
}

float valorSimulado(const String &parametro) {
  float minutos = millis() / 60000.0f;
  if (parametro == "TEMP") return 25.0f + 1.5f * sinf(minutos * 0.5f);
  if (parametro == "PH") return 7.0f + 0.3f * sinf(minutos * 0.3f + 1.0f);
  return 450.0f + 60.0f * sinf(minutos * 0.4f + 2.0f);
}

bool parametroValido(const String &parametro) {
  return parametro == "TEMP" || parametro == "PH" || parametro == "COND";
}

Calibracion& calDe(const String &parametro) {
  if (parametro == "TEMP") return calTemp;
  if (parametro == "COND") return calCond;
  return calPh;
}

float aplicarCorreccion(const Calibracion &c, float crudo) {
  if (c.n == 0) return crudo;
  if (c.n == 1) return crudo + (c.y[0] - c.x[0]);
  float sx = 0, sy = 0, sxy = 0, sxx = 0;
  for (uint8_t i = 0; i < c.n; i++) {
    sx += c.x[i];
    sy += c.y[i];
    sxy += c.x[i] * c.y[i];
    sxx += c.x[i] * c.x[i];
  }
  float nF = c.n;
  float denom = nF * sxx - sx * sx;
  if (fabsf(denom) < 1e-6f) return crudo + (sy - sx) / nF;
  float m = (nF * sxy - sx * sy) / denom;
  float b = (sy - m * sx) / nF;
  return m * crudo + b;
}

void guardarCal(const String &parametro) {
  Calibracion &c = calDe(parametro);
  memoriaCal.begin("acuario", false);
  String clave = "cal_" + parametro;
  memoriaCal.putBytes(clave.c_str(), &c, sizeof(Calibracion));
  memoriaCal.end();
}

void cargarCalibraciones() {
  memoriaCal.begin("acuario", true);
  if (memoriaCal.isKey("cal_TEMP")) memoriaCal.getBytes("cal_TEMP", &calTemp, sizeof(Calibracion));
  if (memoriaCal.isKey("cal_PH")) memoriaCal.getBytes("cal_PH", &calPh, sizeof(Calibracion));
  if (memoriaCal.isKey("cal_COND")) memoriaCal.getBytes("cal_COND", &calCond, sizeof(Calibracion));
  memoriaCal.end();
}

uint8_t codigoParametro(const String &parametro) {
  if (parametro == "TEMP") return 0;
  if (parametro == "PH") return 1;
  return 2;
}

const char* nombreParametro(uint8_t codigo) {
  if (codigo == 0) return "TEMP";
  if (codigo == 1) return "PH";
  return "COND";
}

void iniciarBufferPendientes() {
  if (!LittleFS.begin(true)) {
    Serial.println("No se pudo montar LittleFS: el buffer offline no va a funcionar");
    return;
  }
  memoriaBuffer.begin("buffer", false);
  bufferCabeza = memoriaBuffer.getUInt("cabeza", 0);
  bufferCola = memoriaBuffer.getUInt("cola", 0);
  bufferCantidad = memoriaBuffer.getUInt("cantidad", 0);

  if (!LittleFS.exists(ARCHIVO_PENDIENTES)) {
    File f = LittleFS.open(ARCHIVO_PENDIENTES, "w");
    if (f) f.close();
  }
  Serial.printf("Buffer offline: %u lecturas pendientes de una sesion anterior\n", bufferCantidad);
}

void guardarMetaBuffer() {
  memoriaBuffer.putUInt("cabeza", bufferCabeza);
  memoriaBuffer.putUInt("cola", bufferCola);
  memoriaBuffer.putUInt("cantidad", bufferCantidad);
}

bool escribirRegistroPendiente(uint32_t indice, const RegistroPendiente &registro) {
  File f = LittleFS.open(ARCHIVO_PENDIENTES, "r+");
  if (!f) return false;
  f.seek(indice * sizeof(RegistroPendiente));
  size_t escritos = f.write((const uint8_t*)&registro, sizeof(registro));
  f.close();
  return escritos == sizeof(registro);
}

bool leerRegistroPendiente(uint32_t indice, RegistroPendiente &registro) {
  File f = LittleFS.open(ARCHIVO_PENDIENTES, "r");
  if (!f) return false;
  f.seek(indice * sizeof(RegistroPendiente));
  size_t leidos = f.read((uint8_t*)&registro, sizeof(registro));
  f.close();
  return leidos == sizeof(registro);
}

void guardarLecturaPendiente(const String &parametro, float valor, uint32_t marcaTemporal) {
  RegistroPendiente registro{ marcaTemporal, codigoParametro(parametro), valor };
  if (!escribirRegistroPendiente(bufferCola, registro)) {
    Serial.println("Buffer offline: no se pudo escribir en la memoria flash");
    return;
  }

  bufferCola = (bufferCola + 1) % CAPACIDAD_REGISTROS_PENDIENTES;
  if (bufferCantidad < CAPACIDAD_REGISTROS_PENDIENTES) {
    bufferCantidad++;
  } else {
    bufferCabeza = (bufferCabeza + 1) % CAPACIDAD_REGISTROS_PENDIENTES;
  }
  guardarMetaBuffer();
  Serial.printf("Sin conexion: medicion guardada (%s=%.2f), %u pendientes\n",
                parametro.c_str(), valor, bufferCantidad);
}

void reenviarPendientes(uint32_t maxGrupos) {
  uint32_t gruposEnviados = 0;

  while (bufferCantidad > 0 && mqttClient.connected() && gruposEnviados < maxGrupos) {
    RegistroPendiente primero;
    if (!leerRegistroPendiente(bufferCabeza, primero)) {
      Serial.println("Buffer offline: no se pudo leer un registro pendiente");
      return;
    }

    char marcaTexto[25];
    time_t t = (time_t)primero.marcaTemporal;
    strftime(marcaTexto, sizeof(marcaTexto), "%Y-%m-%dT%H:%M:%SZ", gmtime(&t));

    JsonDocument doc;
    doc["marcaTemporal"] = marcaTexto;
    JsonArray lecturas = doc["lecturas"].to<JsonArray>();
    JsonObject l = lecturas.add<JsonObject>();
    l["parametro"] = nombreParametro(primero.parametro);
    l["valor"] = primero.valor;

    uint32_t agrupados = 1;
    while (agrupados < 3 && agrupados < bufferCantidad) {
      RegistroPendiente siguiente;
      uint32_t indiceSiguiente = (bufferCabeza + agrupados) % CAPACIDAD_REGISTROS_PENDIENTES;
      if (!leerRegistroPendiente(indiceSiguiente, siguiente)) break;
      if (siguiente.marcaTemporal != primero.marcaTemporal) break;

      JsonObject lSiguiente = lecturas.add<JsonObject>();
      lSiguiente["parametro"] = nombreParametro(siguiente.parametro);
      lSiguiente["valor"] = siguiente.valor;
      agrupados++;
    }

    char buffer[256];
    serializeJson(doc, buffer);
    String topic = "acuarios/" + String(IDENTIFICADOR_HARDWARE) + "/mediciones";
    if (!mqttClient.publish(topic.c_str(), buffer)) {
      Serial.println("Buffer offline: fallo el reenvio, se reintenta en la proxima vuelta");
      return;
    }

    bufferCabeza = (bufferCabeza + agrupados) % CAPACIDAD_REGISTROS_PENDIENTES;
    bufferCantidad -= agrupados;
    guardarMetaBuffer();
    gruposEnviados++;
    mqttClient.loop();
  }

  if (bufferCantidad == 0 && gruposEnviados > 0) {
    Serial.println("Buffer offline: todas las lecturas pendientes fueron enviadas");
  }
}

const char* veredictoTds(float mv, uint32_t dispersion, uint32_t deriva) {
  if (deriva > 250) return "CABLE SUELTO: el valor cambia demasiado entre ciclos";
  if (mv < 150) return "PISO DEL ADC: sonda seca o modulo sin alimentacion";
  if (dispersion > 400) return "MUCHO RUIDO: revisar la masa del modulo";
  return "OK";
}

const char* veredictoPh(float mv, uint32_t dispersion, uint32_t deriva) {
  if (mv < 400) return "MUERTO: el modulo no tiene 5 V, o falta masa, o Po no llego";
  if (deriva > 250) return "CABLE SUELTO: el valor cambia demasiado entre ciclos";
  if (mv > 3150) return "AL TOPE: revisar el divisor";
  if (dispersion > 400) return "MUCHO RUIDO: revisar la masa analogica";
  return "OK";
}

void iniciarRtc() {
  hayRtc = rtc.begin();
  if (!hayRtc) {
    Serial.println("Modulo RTC no detectado");
    return;
  }
  if (rtc.lostPower()) {
    Serial.println("RTC sin hora valida (se ajustara al sincronizar por NTP)");
    return;
  }
  struct timeval tv = { (time_t)rtc.now().unixtime(), 0 };
  settimeofday(&tv, nullptr);
  Serial.println("Hora tomada del modulo RTC al arrancar");
}

void iniciarSensores() {
  analogSetPinAttenuation(PIN_TDS, ADC_11db);
  analogSetPinAttenuation(PIN_PH, ADC_11db);
  cargarCalibraciones();
  ds.begin();
  ds.setResolution(12);
  hayDs = ds.getAddress(romDs, 0);
  if (hayDs) {
    Serial.print("DS18B20 detectado, ROM ");
    for (int i = 0; i < 8; i++) Serial.printf("%02X%s", romDs[i], i < 7 ? ":" : "\n");
  } else {
    Serial.println("DS18B20 no detectado en GPIO 4");
  }
  Serial.printf("Calibracion: TEMP %d/3, PH %d/3, COND %d/3 puntos\n", calTemp.n, calPh.n, calCond.n);
}

void leerSensores() {
  if (SIMULAR_SENSORES) {
    float tCrudo = valorSimulado("TEMP");
    float phCrudo = valorSimulado("PH");
    float condCrudo = valorSimulado("COND");

    tempValida = true;
    phValida = true;
    condValida = true;
    ultimaTempOk = tCrudo;
    temperatura = aplicarCorreccion(calTemp, tCrudo);
    ph = aplicarCorreccion(calPh, phCrudo);
    conductividad = aplicarCorreccion(calCond, condCrudo);

    Serial.printf("[SIMULADO] temp %.2f C | pH %.2f | cond %.0f uS/cm\n",
                  temperatura, ph, conductividad);
    return;
  }

  uint32_t mn, mx;

  digitalWrite(PIN_TDS_PWR, LOW);

  float t = NAN;
  if (hayDs) {
    ds.requestTemperatures();
    t = ds.getTempC(romDs);
    if (t == DEVICE_DISCONNECTED_C) {
      hayDs = false;
      t = NAN;
    }
  } else {
    ds.begin();
    hayDs = ds.getAddress(romDs, 0);
    if (hayDs) ds.setResolution(12);
  }
  tempValida = hayDs && !isnan(t) && t != 85.0f;
  if (tempValida) {
    ultimaTempOk = t;
    temperatura = aplicarCorreccion(calTemp, t);
  }

  delay(MS_ASENTAR_PH);
  float phMv = leerMv(PIN_PH, 48, mn, mx);
  uint32_t phDispersion = mx - mn;
  histPh.push(phMv);
  ultimoPo = (phMv / 1000.0f) / K_DIVISOR;
  const char* vPh = veredictoPh(phMv, phDispersion, histPh.rango());
  phValida = strcmp(vPh, "OK") == 0;
  if (phValida) ph = aplicarCorreccion(calPh, phNominal(ultimoPo, ultimaTempOk));

  digitalWrite(PIN_TDS_PWR, HIGH);
  delay(MS_ASENTAR_TDS);
  float tdsMv = leerMv(PIN_TDS, 32, mn, mx);
  uint32_t tdsDispersion = mx - mn;
  digitalWrite(PIN_TDS_PWR, LOW);
  histTds.push(tdsMv);
  const char* vTds = veredictoTds(tdsMv, tdsDispersion, histTds.rango());
  condValida = strcmp(vTds, "OK") == 0;
  if (condValida) conductividad = aplicarCorreccion(calCond, usPorCmDesde(tdsMv, tempValida ? ultimaTempOk : 25.0f));

  if (tempValida) Serial.printf("temp %.2f C", temperatura);
  else Serial.print("temp sin lectura valida");
  Serial.printf(" | pH %.2f (Po %.3f V) [%s]", ph, ultimoPo, vPh);
  Serial.printf(" | cond %.0f uS/cm [%s]\n", conductividad, vTds);
}

void publicarOGuardarLecturas() {
  if (!tempValida && !phValida && !condValida) {
    Serial.println("Ninguna lectura valida: no se publica nada");
    return;
  }

  time_t ahora = time(nullptr);

  if (mqttClient.connected()) {
    publicarLecturas(ahora);
    return;
  }

  if (tempValida) guardarLecturaPendiente("TEMP", temperatura, (uint32_t)ahora);
  if (phValida) guardarLecturaPendiente("PH", ph, (uint32_t)ahora);
  if (condValida) guardarLecturaPendiente("COND", conductividad, (uint32_t)ahora);
}

void publicarLecturas(time_t marcaTemporalEpoch) {
  char marcaTemporal[25];
  strftime(marcaTemporal, sizeof(marcaTemporal), "%Y-%m-%dT%H:%M:%SZ", gmtime(&marcaTemporalEpoch));

  JsonDocument doc;
  doc["marcaTemporal"] = marcaTemporal;
  JsonArray lecturas = doc["lecturas"].to<JsonArray>();

  if (tempValida) {
    JsonObject l = lecturas.add<JsonObject>();
    l["parametro"] = "TEMP";
    l["valor"] = temperatura;
  }
  if (phValida) {
    JsonObject l = lecturas.add<JsonObject>();
    l["parametro"] = "PH";
    l["valor"] = ph;
  }
  if (condValida) {
    JsonObject l = lecturas.add<JsonObject>();
    l["parametro"] = "COND";
    l["valor"] = conductividad;
  }

  char buffer[256];
  serializeJson(doc, buffer);

  String topic = "acuarios/" + String(IDENTIFICADOR_HARDWARE) + "/mediciones";
  mqttClient.publish(topic.c_str(), buffer);

  Serial.print("Publicado en ");
  Serial.print(topic);
  Serial.print(": ");
  Serial.println(buffer);
}

void ayudaCalibracion() {
  Serial.println("Comandos disponibles (PARAM = TEMP, PH o COND):");
  Serial.println("  leer PARAM              -> lectura cruda y corregida");
  Serial.println("  cal PARAM PUNTO VALOR   -> fija el punto 1, 2 o 3 (ej: cal PH 1 6.86)");
  Serial.println("  cal borrar PARAM        -> borra la calibracion de ese parametro");
  Serial.println("  estado                  -> puntos fijados, buffer y conexion");
  Serial.println("  ?                       -> esta ayuda");
}

void estadoCalibraciones() {
  Serial.printf("TEMP %d/3 | PH %d/3 | COND %d/3 puntos fijados\n",
                calTemp.n, calPh.n, calCond.n);
}

float medirPoPh() {
  digitalWrite(PIN_TDS_PWR, LOW);
  delay(MS_ASENTAR_PH);
  uint32_t mn, mx;
  float mv = leerMv(PIN_PH, 48, mn, mx);
  return (mv / 1000.0f) / K_DIVISOR;
}

float medirCrudo(const String &parametro) {
  if (SIMULAR_SENSORES) return valorSimulado(parametro);

  if (parametro == "TEMP") {
    if (!hayDs) return NAN;
    ds.requestTemperatures();
    float t = ds.getTempC(romDs);
    if (t == DEVICE_DISCONNECTED_C || t == 85.0f) return NAN;
    return t;
  }
  if (parametro == "PH") {
    return phNominal(medirPoPh(), ultimaTempOk);
  }
  if (parametro == "COND") {
    digitalWrite(PIN_TDS_PWR, HIGH);
    delay(MS_ASENTAR_TDS);
    uint32_t mn, mx;
    float mv = leerMv(PIN_TDS, 32, mn, mx);
    digitalWrite(PIN_TDS_PWR, LOW);
    return usPorCmDesde(mv, isnan(ultimaTempOk) ? 25.0f : ultimaTempOk);
  }
  return NAN;
}

bool fijarPuntoCalibracion(const String &parametro, int punto, float valorReferencia,
                           float &antes, float &despues, const char *&error) {
  if (!parametroValido(parametro)) {
    error = "parametro desconocido";
    return false;
  }
  if (punto < 1 || punto > 3) {
    error = "el punto debe ser 1, 2 o 3";
    return false;
  }
  float crudo = medirCrudo(parametro);
  if (isnan(crudo)) {
    error = "no se pudo tomar la lectura";
    return false;
  }
  Calibracion &c = calDe(parametro);
  antes = aplicarCorreccion(c, crudo);
  c.x[punto - 1] = crudo;
  c.y[punto - 1] = valorReferencia;
  if (punto > c.n) c.n = punto;
  guardarCal(parametro);
  despues = aplicarCorreccion(c, crudo);
  return true;
}

void publicarRespuestaCalibracion(JsonDocument &resp) {
  char buffer[320];
  serializeJson(resp, buffer);
  String topic = "acuarios/" + String(IDENTIFICADOR_HARDWARE) + "/calibracion/respuesta";
  mqttClient.publish(topic.c_str(), buffer);
  Serial.print("Calibracion, respuesta publicada: ");
  Serial.println(buffer);
}

void manejarComandoCalibracion(byte *payload, unsigned int length) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, length)) {
    Serial.println("Calibracion: comando con JSON invalido");
    return;
  }

  String solicitudId = doc["solicitudId"] | "";
  String accion = doc["accion"] | "";
  String parametro = doc["parametro"] | "";

  JsonDocument resp;
  resp["solicitudId"] = solicitudId;

  if (!parametroValido(parametro)) {
    resp["ok"] = false;
    resp["error"] = "parametro desconocido";
  } else if (accion == "leer") {
    float valor = medirCrudo(parametro);
    if (isnan(valor)) {
      resp["ok"] = false;
      resp["error"] = "no se pudo tomar la lectura";
    } else {
      resp["ok"] = true;
      resp["lectura"] = valor;
    }
  } else if (accion == "fijarPunto") {
    if (!doc["valorReferencia"].is<float>()) {
      resp["ok"] = false;
      resp["error"] = "falta el valor de referencia";
    } else {
      int punto = doc["punto"] | 0;
      float antes, despues;
      const char *error = "";
      float valorReferencia = doc["valorReferencia"];
      if (fijarPuntoCalibracion(parametro, punto, valorReferencia, antes, despues, error)) {
        resp["ok"] = true;
        resp["lecturaAntes"] = antes;
        resp["lecturaDespues"] = despues;
      } else {
        resp["ok"] = false;
        resp["error"] = error;
      }
    }
  } else {
    resp["ok"] = false;
    resp["error"] = "accion desconocida";
  }

  publicarRespuestaCalibracion(resp);
}

void manejarMensajeMqtt(char *topic, byte *payload, unsigned int length) {
  String t = String(topic);
  if (t.endsWith("/calibracion/comando")) {
    manejarComandoCalibracion(payload, length);
  }
}

String tokenSerie(const String &linea, int indice) {
  int inicio = 0;
  for (int i = 0; i < indice; i++) {
    inicio = linea.indexOf(' ', inicio);
    if (inicio < 0) return "";
    while (inicio < (int)linea.length() && linea[inicio] == ' ') inicio++;
  }
  int fin = linea.indexOf(' ', inicio);
  return fin < 0 ? linea.substring(inicio) : linea.substring(inicio, fin);
}

void procesarComandoSerie(const String &linea) {
  String comando = tokenSerie(linea, 0);
  comando.toLowerCase();

  if (comando == "?") {
    ayudaCalibracion();
    return;
  }

  if (comando == "estado") {
    estadoCalibraciones();
    Serial.printf("Buffer offline: %u/%u lecturas pendientes de envio\n",
                  bufferCantidad, CAPACIDAD_REGISTROS_PENDIENTES);
    Serial.printf("Conexion: %s\n", estadoConexion());
    return;
  }

  if (comando == "leer") {
    String parametro = tokenSerie(linea, 1);
    parametro.toUpperCase();
    if (!parametroValido(parametro)) {
      Serial.println("Parametro invalido. Use TEMP, PH o COND");
      return;
    }
    float crudo = medirCrudo(parametro);
    if (isnan(crudo)) {
      Serial.println("No se pudo tomar la lectura");
      return;
    }
    Serial.printf("%s: crudo %.2f | corregido %.2f\n",
                  parametro.c_str(), crudo, aplicarCorreccion(calDe(parametro), crudo));
    return;
  }

  if (comando == "cal") {
    String segundo = tokenSerie(linea, 1);
    String segundoMinuscula = segundo;
    segundoMinuscula.toLowerCase();

    if (segundoMinuscula == "borrar") {
      String parametro = tokenSerie(linea, 2);
      parametro.toUpperCase();
      if (!parametroValido(parametro)) {
        Serial.println("Parametro invalido. Use TEMP, PH o COND");
        return;
      }
      calDe(parametro) = Calibracion();
      guardarCal(parametro);
      Serial.printf("Calibracion de %s borrada\n", parametro.c_str());
      return;
    }

    String parametro = segundo;
    parametro.toUpperCase();
    String puntoTexto = tokenSerie(linea, 2);
    String valorTexto = tokenSerie(linea, 3);
    if (puntoTexto == "" || valorTexto == "") {
      Serial.println("Faltan datos. Ejemplo: cal PH 1 6.86");
      return;
    }

    float antes, despues;
    const char *error = "";
    if (!fijarPuntoCalibracion(parametro, puntoTexto.toInt(), valorTexto.toFloat(), antes, despues, error)) {
      Serial.printf("No se pudo fijar el punto: %s\n", error);
      return;
    }
    Serial.printf("%s punto %s fijado en %s -> antes %.2f, despues %.2f\n",
                  parametro.c_str(), puntoTexto.c_str(), valorTexto.c_str(), antes, despues);
    estadoCalibraciones();
    return;
  }

  Serial.println("Comando desconocido. Escribi ? para ver la ayuda");
}

void atenderComandosSerie() {
  static String linea;
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      linea.trim();
      if (linea.length()) procesarComandoSerie(linea);
      linea = "";
    } else if (linea.length() < 48) {
      linea += c;
    }
  }
}

void iniciarDisplay() {
  Wire.beginTransmission(DIRECCION_DISPLAY);
  hayDisplay = Wire.endTransmission() == 0;
  if (!hayDisplay) {
    Serial.println("Display no detectado: la placa mide igual");
    return;
  }
  display.begin();
  display.setContrast(160);
  mostrarMensajeEnDisplay("Acuario IoT", "iniciando...", "");
}

void mostrarMensajeEnDisplay(const char* titulo, const char* linea1, const char* linea2) {
  if (!hayDisplay) return;
  display.clearBuffer();
  display.setFont(u8g2_font_helvB10_tf);
  display.drawStr(0, 14, titulo);
  display.setFont(u8g2_font_6x12_tf);
  display.drawStr(0, 36, linea1);
  display.drawStr(0, 52, linea2);
  display.sendBuffer();
}

const char* estadoConexion() {
  if (WiFi.status() != WL_CONNECTED) return "Sin WiFi";
  if (!mqttClient.connected()) return "WiFi OK - sin MQTT";
  return "Conectado";
}

void mostrarEnDisplay() {
  if (!hayDisplay) return;
  char valor[24];
  display.clearBuffer();
  display.setFont(u8g2_font_6x12_tf);
  display.drawStr(0, 12, "Temp");
  display.drawStr(0, 30, "pH");
  display.drawStr(0, 48, "EC");
  display.setFont(u8g2_font_helvB12_tf);
  if (tempValida) snprintf(valor, sizeof valor, "%.1f C", temperatura); else strlcpy(valor, "--", sizeof valor);
  display.drawStr(34, 13, valor);
  if (phValida) snprintf(valor, sizeof valor, "%.2f", ph); else strlcpy(valor, "--", sizeof valor);
  display.drawStr(34, 31, valor);
  if (condValida) snprintf(valor, sizeof valor, "%.0f uS", conductividad); else strlcpy(valor, "--", sizeof valor);
  display.drawStr(34, 49, valor);
  display.drawHLine(0, 53, 128);
  display.setFont(u8g2_font_5x8_tf);
  display.drawStr(0, 63, estadoConexion());
  display.sendBuffer();
}
