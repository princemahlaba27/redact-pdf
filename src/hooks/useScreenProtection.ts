import * as ScreenCapture from 'expo-screen-capture';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { Haptic } from '../services/haptics';

const PROTECTION_KEY = 'redactpdf-editor';

/**
 * Blocks screen capture / app-switcher previews while active, and surfaces
 * an education banner when the user attempts a screenshot.
 *
 * iOS: secure window buffer (black screenshots/recordings) + app-switcher blur.
 * Android: FLAG_SECURE (black captures and recents preview).
 */
export function useScreenProtection(enabled = true) {
  const [bannerVisible, setBannerVisible] = useState(false);

  useEffect(() => {
    if (!enabled) return;

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
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const subscription = ScreenCapture.addScreenshotListener(() => {
      void Haptic.warning();
      setBannerVisible(true);
    });

    return () => {
      subscription.remove();
    };
  }, [enabled]);

  const dismissBanner = useCallback(() => setBannerVisible(false), []);

  return { bannerVisible, dismissBanner };
}
