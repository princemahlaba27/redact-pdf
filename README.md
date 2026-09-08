# RedactPDF

Cross-platform PDF redaction app built with **Expo (React Native + TypeScript)** — permanently sanitize sensitive data **100% on-device**. Runs on **Android** and **iOS**.

## Why Expo?

Widely used production stack: Expo + React Native + TypeScript. One codebase for Android and iPhone, fast iteration with Expo Go, and EAS Build for store releases.

## Features

- **Smart Redaction** — On-device PII pattern detection (SSN, email, phone, credit card)
- **Manual Draw** — Drag to create redaction boxes over the PDF preview
- **Styles** — Solid black, solid white, or blur approximation
- **Burn & Export** — Writes opaque fills into the PDF and strips metadata, then opens the system share sheet
- **Export Paywall** — Subscription gate before share (local unlock for QA; wire RevenueCat/Superwall for production)

## Requirements

- Node.js 20+
- Expo CLI (`npx expo`)
- Android phone with Expo Go **or** Android Studio for a dev build
- Mac + Xcode only when you are ready to ship iOS

## Quick start (Android — no Mac)

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** on your Android phone, or press `a` with an emulator/device connected.

```bash
# Optional: native binary (Play Store–style)
npx expo run:android
```

## iOS (when you have a Mac)

```bash
npx expo start
# or
npx expo run:ios
```

## Project layout

```
app/                 # Expo Router screens (dashboard, editor, paywall)
src/
  components/        # Premium UI primitives
  models/            # Redaction types
  services/          # OCR/PII scan, burn/flatten, subscription, haptics
  theme/             # Apple HIG design tokens
archive/
  ios-swiftui/       # Original SwiftUI prototype
  flutter/           # Previous Flutter prototype
```

## Monetization (production)

`src/services/subscription.ts` unlocks locally after the paywall CTA so you can QA export without store credentials.

Before production, replace `purchaseIntroductoryOffer()` with:

- [RevenueCat](https://www.revenuecat.com/) (`react-native-purchases`) — most common Expo path, or
- [Superwall](https://superwall.com/) Expo/RN SDK

## Privacy

Document processing stays on-device. No PDF bytes are uploaded by the app.

In-app legal documents (Last Updated: September 2026):

- Privacy Policy — `/privacy`
- Terms of Use (EULA) — `/terms`

Support: princemahlaba27@gmail.com

## License

Proprietary. All rights reserved.
