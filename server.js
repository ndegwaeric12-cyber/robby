// ======================================================
// ESP32 VANGUARD CLIENT
// Connects OUT to Render backend — no IP needed anywhere
// ======================================================

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <ArduinoWebsockets.h>
#include <ArduinoJson.h>

using namespace websockets;

// ======================================================
// CONFIG  — only thing you ever change
// ======================================================

const char*    WIFI_SSID  = "YourWiFiName";
const char*    WIFI_PASS  = "YourWiFiPassword";
const char*    DEVICE_ID  = "esp32-001";          // unique per robot

const char*    WS_HOST    = "vanguard-driver.onrender.com";
const uint16_t WS_PORT    = 443;
const char*    WS_PATH    = "/vanguard-ws";

// ======================================================
// MOTOR PINS  (L298N)
// ======================================================

const int IN1 = 26, IN2 = 27;   // Left motor
const int IN3 = 14, IN4 = 12;   // Right motor

// ======================================================
// MOTOR FUNCTIONS
// ======================================================

void stopAll()       { digitalWrite(IN1,LOW);  digitalWrite(IN2,LOW);
                       digitalWrite(IN3,LOW);  digitalWrite(IN4,LOW); }

void moveForward()   { digitalWrite(IN1,HIGH); digitalWrite(IN2,LOW);
                       digitalWrite(IN3,HIGH); digitalWrite(IN4,LOW); }

void moveBackward()  { digitalWrite(IN1,LOW);  digitalWrite(IN2,HIGH);
                       digitalWrite(IN3,LOW);  digitalWrite(IN4,HIGH); }

void turnLeft()      { digitalWrite(IN1,LOW);  digitalWrite(IN2,HIGH);
                       digitalWrite(IN3,HIGH); digitalWrite(IN4,LOW); }

void turnRight()     { digitalWrite(IN1,HIGH); digitalWrite(IN2,LOW);
                       digitalWrite(IN3,LOW);  digitalWrite(IN4,HIGH); }

// ======================================================
// WEBSOCKET
// ======================================================

WebsocketsClient wsClient;
bool wsConnected  = false;
unsigned long lastTelemetry = 0;
const unsigned long TELEMETRY_MS = 5000;

// ======================================================
// SEND IDENTIFY
// ======================================================

void sendIdentify() {
  StaticJsonDocument<128> doc;
  doc["type"]     = "identify";
  doc["client"]   = "device";
  doc["deviceId"] = DEVICE_ID;
  String out; serializeJson(doc, out);
  wsClient.send(out);
  Serial.println("IDENTIFY_SENT");
}

// ======================================================
// SEND TELEMETRY
// ======================================================

void sendTelemetry() {
  StaticJsonDocument<256> doc;
  doc["type"]      = "telemetry";
  doc["soil"]      = analogRead(34) / 40.95;  // real sensor read
  doc["temp"]      = 27.4;                     // replace with real sensor
  doc["hum"]       = 60.1;                     // replace with real sensor
  doc["timestamp"] = millis();
  String out; serializeJson(doc, out);
  wsClient.send(out);
  Serial.println("TELEMETRY_SENT");
}

// ======================================================
// INCOMING MESSAGE HANDLER
// ======================================================

void onMessage(WebsocketsMessage msg) {
  Serial.println("MSG: " + msg.data());

  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, msg.data())) return;

  const char* type = doc["type"] | "";

  if (strcmp(type, "control") == 0) {
    const char* cmd = doc["command"] | "";
    Serial.println("CMD: " + String(cmd));

    if      (strcmp(cmd, "forward")  == 0) moveForward();
    else if (strcmp(cmd, "backward") == 0) moveBackward();
    else if (strcmp(cmd, "left")     == 0) turnLeft();
    else if (strcmp(cmd, "right")    == 0) turnRight();
    else if (strcmp(cmd, "stop")     == 0) stopAll();
  }
}

// ======================================================
// EVENT HANDLER
// ======================================================

void onEvent(WebsocketsEvent event, String data) {
  if (event == WebsocketsEvent::ConnectionOpened) {
    Serial.println("WS_CONNECTED");
    wsConnected = true;
    sendIdentify();
  }
  else if (event == WebsocketsEvent::ConnectionClosed) {
    Serial.println("WS_DISCONNECTED");
    wsConnected = false;
  }
  else if (event == WebsocketsEvent::GotPing) {
    wsClient.pong();
  }
}

// ======================================================
// WIFI
// ======================================================

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WIFI");
  uint8_t t = 0;
  while (WiFi.status() != WL_CONNECTED && t++ < 40) {
    delay(500); Serial.print(".");
  }
  if (WiFi.status() != WL_CONNECTED) ESP.restart();
  Serial.println("\nWIFI_OK " + WiFi.localIP().toString());
}

// ======================================================
// NTP  (required for SSL on Render)
// ======================================================

void syncTime() {
  configTime(0, 0, "pool.ntp.org");
  time_t now = time(nullptr);
  uint8_t t = 0;
  while (now < 1000000000UL && t++ < 40) {
    delay(500); now = time(nullptr);
  }
  if (now < 1000000000UL) ESP.restart();
  Serial.println("TIME_OK");
}

// ======================================================
// CONNECT WS
// ======================================================

void connectWS() {
  wsClient.onMessage(onMessage);
  wsClient.onEvent(onEvent);
  wsClient.setInsecure();   // skip cert verify for Render's dynamic SSL

  bool ok = wsClient.connect(WS_HOST, WS_PORT, WS_PATH);
  if (!ok) {
    Serial.println("WS_FAILED");
    wsConnected = false;
  }
}

// ======================================================
// SETUP
// ======================================================

void setup() {
  Serial.begin(115200);
  delay(1000);

  // Motor pins
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  stopAll();

  connectWiFi();
  syncTime();
  connectWS();
}

// ======================================================
// LOOP
// ======================================================

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    return;
  }

  wsClient.poll();

  if (!wsConnected) {
    delay(5000);
    connectWS();
    return;
  }

  if (millis() - lastTelemetry > TELEMETRY_MS) {
    lastTelemetry = millis();
    sendTelemetry();
  }
}