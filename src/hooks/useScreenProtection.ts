import * as ScreenCapture from 'expo-screen-capture';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { Haptic } from '../services/haptics';

const PROTECTION_KEY = 'redactpdf-editor';

/**
 * TEMP (App Store screenshots): set to `true` again after marketing captures
 * are done. When false, screenshots / recordings / app-switcher previews work.
 */
export const SCREEN_CAPTURE_PROTECTION_ENABLED = false;

/**
 * Blocks screen capture / app-switcher previews while active, and surfaces
 * an education banner when the user attempts a screenshot.
 *
 * iOS: secure window buffer (black screenshots/recordings) + app-switcher blur.
 * Android: FLAG_SECURE (black captures and recents preview).
 */
export function useScreenProtection(enabled = true) {
  const [bannerVisible, setBannerVisible] = useState(false);
  const active = enabled && SCREEN_CAPTURE_PROTECTION_ENABLED;

  useEffect(() => {
    if (!active) {
      // Ensure any prior lock is released while temporarily disabled.
      void ScreenCapture.allowScreenCaptureAsync(PROTECTION_KEY);
      if (Platform.OS === 'ios') {
        void ScreenCapture.disableAppSwitcherProtectionAsync();
      }
      return;
    }

    void ScreenCapture.preventScreenCaptureAsync(PROTECTION_KEY);
    if (Platform.OS === 'ios') {
      void ScreenCapture.enableAppSwitcherProtectionAsync(0.85);
    }

    return () => {
      void ScreenCapture.allowScreenCaptureAsync(PROTECTION_KEY);
      if (Platform.OS === 'ios') {
        void ScreenCapture.disableAppSwitcherProtectionAsync();
      }
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;

    const subscription = ScreenCapture.addScreenshotListener(() => {
      void Haptic.warning();
      setBannerVisible(true);
    });

    return () => {
      subscription.remove();
    };
  }, [active]);

  const dismissBanner = useCallback(() => setBannerVisible(false), []);

  return { bannerVisible, dismissBanner };
}
