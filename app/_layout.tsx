import { Buffer } from 'buffer';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';

import {
  configureRevenueCat,
  useSubscription,
} from '../src/services/subscription';
import { AppleDS } from '../src/theme/tokens';

// pdf-lib expects Buffer in React Native
if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;
}

export default function RootLayout() {
  const hydrate = useSubscription((s) => s.hydrate);

  useEffect(() => {
    // RevenueCat iOS SDK — configure once on app mount, then hydrate entitlement.
    void (async () => {
      await configureRevenueCat();
      await hydrate();
    })();
  }, [hydrate]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: AppleDS.canvas }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: AppleDS.canvas },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen
          name="thermal-scan"
          options={{ animation: 'fade', gestureEnabled: false }}
        />
        <Stack.Screen
          name="editor"
          options={{ animation: 'slide_from_right', gestureEnabled: false }}
        />
        <Stack.Screen
          name="paywall"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="privacy"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="terms"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack>
    </GestureHandlerRootView>
  );
}
