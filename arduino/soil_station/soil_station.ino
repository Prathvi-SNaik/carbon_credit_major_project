/*
  CarbonCreditFarm soil station
  Arduino Uno / Nano / Mega

  Wiring
  ------
  EC20-BNC (or E-201-C) pH electrode
      BNC → PH-4502C analog pH module
      PH-4502C V+ → 5V
      PH-4502C G  → GND
      PH-4502C Po → A0

  Capacitive soil moisture v1.2
      VCC → 3.3V (preferred) or 5V
      GND → GND
      AOUT → A1

  Temperature
      LM35  VCC→5V  OUT→A2  GND→GND
      (or DS18B20 on D4 with 4.7k pull-up — then set USE_DS18B20 1)

  USB serial 9600. serial_bridge.py posts JSON to the API.
*/

#define USE_DS18B20 0

const int PIN_PH = A0;
const int PIN_MOIST = A1;
const int PIN_TEMP = A2;

// Calibrate in pH 7.00 and pH 4.00 buffers. Default: ~2.5 V at pH 7.
const float PH_NEUTRAL_VOLTAGE = 2.50;
const float PH_SLOPE = 3.5; // pH units per volt around pH 7 (tune on buffers)

const int MOIST_AIR = 620;   // ADC in dry air
const int MOIST_WATER = 280; // ADC in water

void setup() {
  Serial.begin(9600);
}

float readPh() {
  long acc = 0;
  for (int i = 0; i < 16; i++) {
    acc += analogRead(PIN_PH);
    delay(15);
  }
  float voltage = (acc / 16.0) * (5.0 / 1023.0);
  float ph = 7.0 + ((PH_NEUTRAL_VOLTAGE - voltage) * PH_SLOPE);
  if (ph < 3.5) ph = 3.5;
  if (ph > 10.5) ph = 10.5;
  return ph;
}

float readMoisture() {
  int adc = analogRead(PIN_MOIST);
  float pct = (float)(MOIST_AIR - adc) / (float)(MOIST_AIR - MOIST_WATER) * 100.0;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return pct;
}

float readTempC() {
#if USE_DS18B20
  return 26.0; // replace with OneWire DallasTemperature read
#else
  float mv = analogRead(PIN_TEMP) * (5000.0 / 1023.0);
  return mv / 10.0; // LM35: 10 mV / °C
#endif
}

void loop() {
  float ph = readPh();
  float moisture = readMoisture();
  float temperature = readTempC();

  Serial.print("{\"deviceId\":\"ARDUINO-01\",\"ph\":");
  Serial.print(ph, 2);
  Serial.print(",\"moisture\":");
  Serial.print(moisture, 1);
  Serial.print(",\"temperature\":");
  Serial.print(temperature, 1);
  Serial.println("}");
  delay(3000);
}
