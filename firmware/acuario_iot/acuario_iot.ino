#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <time.h>
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
const int PIN_TDS = 34;
const int PIN_PH = 35;

const float K_DIVISOR = 1800.0f / 2800.0f;
const uint32_t MS_ASENTAR_PH = 800;
const uint32_t MS_ASENTAR_TDS = 800;
const float PH_V_NEUTRO = 2.500f;
const float PH_V_POR_UNIDAD = 0.175f;

Preferences preferencias;
Preferences memoriaCal;
WebServer servidorConfig(80);
DNSServer dnsServer;
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

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

float calV1 = 0, calPh1 = 0, calV2 = 0, calPh2 = 0;
bool cal1 = false, cal2 = false;
float calTc = 25.0f;
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
    conectarMqtt();
  }
  mqttClient.loop();

  if (millis() - ultimoMuestreo >= INTERVALO_MUESTREO_MS) {
    ultimoMuestreo = millis();
    leerSensores();
    publicarLecturas();
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

  sincronizarHoraNTP();
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
}

void sincronizarHoraNTP() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.print("Sincronizando hora por NTP");
  time_t ahora = time(nullptr);
  while (ahora < 1700000000) {
    delay(500);
    Serial.print(".");
    ahora = time(nullptr);
  }
  Serial.println();
  Serial.println("Hora sincronizada correctamente");
}

void conectarMqtt() {
  while (!mqttClient.connected()) {
    Serial.print("Conectando a MQTT...");
    String clientId = "ESP32-" + String(IDENTIFICADOR_HARDWARE);
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println(" conectado");
    } else {
      Serial.print(" fallo, codigo=");
      Serial.print(mqttClient.state());
      Serial.println(" -- reintentando en 5s");
      delay(5000);
    }
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

float phDesdePo(float po, float tempC) {
  float tK = (isnan(tempC) ? calTc : tempC) + 273.15f;
  if (cal1 && cal2 && fabsf(calV1 - calV2) > 0.05f) {
    float m = (calPh1 - calPh2) / (calV1 - calV2);
    float v7 = calV1 + (7.0f - calPh1) / m;
    float mT = m * (calTc + 273.15f) / tK;
    return 7.0f + mT * (po - v7);
  }
  float sT = PH_V_POR_UNIDAD * tK / 298.15f;
  if (cal1) return calPh1 + (calV1 - po) / sT;
  return 7.0f + (PH_V_NEUTRO - po) / sT;
}

const char* estadoCal() {
  static char buf[56];
  if (cal1 && cal2) {
    snprintf(buf, sizeof buf, "calibrado con 2 puntos (a %.1f C)", calTc);
    return buf;
  }
  if (cal1) return "calibrado con 1 punto (pendiente nominal)";
  return "SIN CALIBRAR (recta de fabrica: el valor es orientativo)";
}

void guardarCal() {
  memoriaCal.begin("acuario", false);
  memoriaCal.putFloat("v1", calV1);
  memoriaCal.putFloat("p1", calPh1);
  memoriaCal.putFloat("v2", calV2);
  memoriaCal.putFloat("p2", calPh2);
  memoriaCal.putBool("c1", cal1);
  memoriaCal.putBool("c2", cal2);
  memoriaCal.putFloat("tc", calTc);
  memoriaCal.end();
}

void cargarCal() {
  memoriaCal.begin("acuario", true);
  calV1 = memoriaCal.getFloat("v1", 0);
  calPh1 = memoriaCal.getFloat("p1", 0);
  calV2 = memoriaCal.getFloat("v2", 0);
  calPh2 = memoriaCal.getFloat("p2", 0);
  cal1 = memoriaCal.getBool("c1", false);
  cal2 = memoriaCal.getBool("c2", false);
  calTc = memoriaCal.getFloat("tc", 25.0f);
  memoriaCal.end();
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

void iniciarSensores() {
  analogSetPinAttenuation(PIN_TDS, ADC_11db);
  analogSetPinAttenuation(PIN_PH, ADC_11db);
  cargarCal();
  ds.begin();
  ds.setResolution(12);
  hayDs = ds.getAddress(romDs, 0);
  if (hayDs) {
    Serial.print("DS18B20 detectado, ROM ");
    for (int i = 0; i < 8; i++) Serial.printf("%02X%s", romDs[i], i < 7 ? ":" : "\n");
  } else {
    Serial.println("DS18B20 no detectado en GPIO 4");
  }
  Serial.print("Calibracion de pH: ");
  Serial.println(estadoCal());
}

void leerSensores() {
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
    temperatura = t;
    ultimaTempOk = t;
  }

  delay(MS_ASENTAR_PH);
  float phMv = leerMv(PIN_PH, 48, mn, mx);
  uint32_t phDispersion = mx - mn;
  histPh.push(phMv);
  ultimoPo = (phMv / 1000.0f) / K_DIVISOR;
  const char* vPh = veredictoPh(phMv, phDispersion, histPh.rango());
  phValida = strcmp(vPh, "OK") == 0;
  if (phValida) ph = phDesdePo(ultimoPo, ultimaTempOk);

  digitalWrite(PIN_TDS_PWR, HIGH);
  delay(MS_ASENTAR_TDS);
  float tdsMv = leerMv(PIN_TDS, 32, mn, mx);
  uint32_t tdsDispersion = mx - mn;
  digitalWrite(PIN_TDS_PWR, LOW);
  histTds.push(tdsMv);
  const char* vTds = veredictoTds(tdsMv, tdsDispersion, histTds.rango());
  condValida = strcmp(vTds, "OK") == 0;
  if (condValida) conductividad = usPorCmDesde(tdsMv, tempValida ? temperatura : 25.0f);

  if (tempValida) Serial.printf("temp %.2f C", temperatura);
  else Serial.print("temp sin lectura valida");
  Serial.printf(" | pH %.2f (Po %.3f V) [%s]", ph, ultimoPo, vPh);
  Serial.printf(" | cond %.0f uS/cm [%s]\n", conductividad, vTds);
}

void publicarLecturas() {
  if (!tempValida && !phValida && !condValida) {
    Serial.println("Ninguna lectura valida: no se publica nada");
    return;
  }

  time_t ahora = time(nullptr);
  char marcaTemporal[25];
  strftime(marcaTemporal, sizeof(marcaTemporal), "%Y-%m-%dT%H:%M:%SZ", gmtime(&ahora));

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
  Serial.println("Comandos disponibles:");
  Serial.println("  c7  -> tomar la lectura actual como pH 7");
  Serial.println("  c4  -> tomar la lectura actual como pH 4");
  Serial.println("  c10 -> tomar la lectura actual como pH 10");
  Serial.println("  cr  -> borrar la calibracion guardada");
  Serial.println("  ?   -> esta ayuda");
}

void fijarPunto(float phReferencia) {
  digitalWrite(PIN_TDS_PWR, LOW);
  delay(MS_ASENTAR_PH);
  uint32_t mn, mx;
  float mv = leerMv(PIN_PH, 48, mn, mx);
  ultimoPo = (mv / 1000.0f) / K_DIVISOR;

  if (!cal1) {
    calV1 = ultimoPo;
    calPh1 = phReferencia;
    cal1 = true;
  } else {
    calV2 = ultimoPo;
    calPh2 = phReferencia;
    cal2 = true;
  }
  calTc = isnan(ultimaTempOk) ? 25.0f : ultimaTempOk;
  guardarCal();
  Serial.printf("Guardado: %.3f V = pH %.2f a %.1f C (%s)\n",
                ultimoPo, phReferencia, calTc, estadoCal());
}

void atenderComandosSerie() {
  static String linea;
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') {
      linea.trim();
      linea.toLowerCase();
      if (linea == "c7") fijarPunto(7.0f);
      else if (linea == "c4") fijarPunto(4.0f);
      else if (linea == "c10") fijarPunto(10.0f);
      else if (linea == "cr") {
        cal1 = false;
        cal2 = false;
        guardarCal();
        Serial.println("Calibracion borrada");
      }
      else if (linea == "?") ayudaCalibracion();
      else if (linea.length()) Serial.println("Comando desconocido. Escribi ? para ver la ayuda");
      linea = "";
    } else if (linea.length() < 32) {
      linea += c;
    }
  }
}
