# Project limitations

1. Browser Geolocation / consumer GPS is not cadastral or survey-grade.
2. The SOC model generalises from WoSIS laboratory profiles; coverage for Karnataka is sparse compared with the global table.
3. Predicted SOC ≠ measured SOC.
4. Soil readings in the default demo are MANUAL. `/api/iot/readings` is the future ESP32 path; no sensor is claimed to be attached.
5. IPCC stock change uses default bulk density 1.3 g cm⁻³ when BD is missing — that stock is estimated, not measured.
6. Blockchain certification in this repository is an academic hash/certificate, not Verra, BIS, or UNFCCC issuance.
7. Demo OTP is displayed in the UI because there is no SMS gateway.
