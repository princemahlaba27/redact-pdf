import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '../src/components/ui';
import { AppleDS, typography } from '../src/theme/tokens';

/**
 * Compatibility shim — previously ran a fake laser / mock-box scan.
 * Now immediately hands off to the editor, where pdf.js extracts real
 * text tokens and places blackouts only on matched glyph bounds.
 */
export default function ThermalScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ uri: string; title: string }>();
  const uri = Array.isArray(params.uri) ? params.uri[0] : params.uri;
  const title = Array.isArray(params.title) ? params.title[0] : params.title;

  useEffect(() => {
    if (!uri) {
      router.back();
      return;
    }
    router.replace({
      pathname: '/editor',
      params: { uri, title: title || 'Document' },
    });
  }, [uri, title, router]);

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.copy}>Opening document…</Text>
        </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  copy: {
    ...typography.subheadline,
    color: AppleDS.labelSecondary,
  },
});
