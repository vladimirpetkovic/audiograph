// Audiograph Lights: receives Adalight frames over USB from Audiograph Pro (the Lights node)
// and shows them on a WS2812B / NeoPixel strip.
// Needs the FastLED library (Arduino IDE: Tools > Manage Libraries > FastLED).
// Set NUM_LEDS and DATA_PIN for your wiring, upload, then press Connect lights in Audiograph
// with the same LED count and baud rate.
#include <FastLED.h>

#define NUM_LEDS 60
#define DATA_PIN 5
#define BAUD 115200

CRGB leds[NUM_LEDS];

int readByte() {
  unsigned long t = millis();
  while (!Serial.available()) if (millis() - t > 250) return -1;
  return Serial.read();
}

void setup() {
  FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setMaxPowerInVoltsAndMilliamps(5, 2000);  // raise to match your power supply
  Serial.begin(BAUD);
  fill_solid(leds, NUM_LEDS, CRGB(0, 0, 16));
  FastLED.show();
}

void loop() {
  // Wait for the "Ada" header.
  if (readByte() != 'A' || readByte() != 'd' || readByte() != 'a') return;
  int hi = readByte(), lo = readByte(), chk = readByte();
  if (hi < 0 || lo < 0 || chk != (hi ^ lo ^ 0x55)) return;
  int count = (hi << 8 | lo) + 1;
  for (int i = 0; i < count; i++) {
    int r = readByte(), g = readByte(), b = readByte();
    if (b < 0) return;
    if (i < NUM_LEDS) leds[i] = CRGB(r, g, b);
  }
  FastLED.show();
}
