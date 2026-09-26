# CPE Keeper

Tracks CPA continuing education (CPE) against each state board's rules.

## Run it on your iPhone (first time)

1. Install **Expo Go** from the App Store on your iPhone.
2. On your Mac, open **Terminal** and run:

```bash
cd ~/Developer/cpe-keeper
npm install
npx expo start
```

3. A QR code appears in Terminal. Open the iPhone **Camera**, point it at the code, and tap the banner.
   Your Mac and iPhone must be on the same Wi-Fi network.

At the bottom of the screen you should see **Backend: connected ✓**.

## Project layout

- `App.tsx`: the current dashboard screen
- `src/engine/engine.ts`: the rules engine (one engine covers every state)
- `src/rules/CA.json`: California rules, taken from the CBA website
- `src/data/sampleRecords.ts`: test data (Nazim's real records), temporary until login is built
- `supabase/001_setup.sql`: database setup, run once in the Supabase SQL Editor
- `scripts/test-nazim.ts`: rules test, run with `npm test`

## Config

`.env` holds the Supabase URL and publishable key. Git ignores it on purpose.
