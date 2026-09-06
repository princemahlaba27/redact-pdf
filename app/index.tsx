import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import {
  ActionCard,
  Badge,
  LoadingOverlay,
  ScreenBackground,
  TrustBanner,
} from '../src/components/ui';
import { Haptic } from '../src/services/haptics';
import { cachePdfUri, imagesToPdf } from '../src/services/redactionEngine';
import { AppleDS, typography } from '../src/theme/tokens';

export default function DashboardScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const openEditor = (nextUri: string, nextTitle: string) => {
    router.push({
      pathname: '/editor',
      params: { uri: nextUri, title: nextTitle },
    });
  };

  const onOpenPdf = async () => {
    await Haptic.medium();
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setBusy(true);
    try {
      // Always re-copy into a stable cache path for WebView / pdf-lib access.
      const cachedUri = await cachePdfUri(asset.uri);
      await Haptic.success();
      openEditor(cachedUri, asset.name?.replace(/\.pdf$/i, '') || 'Evidence');
    } catch {
      await Haptic.error();
    } finally {
      setBusy(false);
    }
  };

  const onOpenPhotos = async () => {
    await Haptic.light();
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      await Haptic.error();
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      quality: 0.92,
      mediaTypes: ['images'],
    });
    if (result.canceled || result.assets.length === 0) return;

    setBusy(true);
    try {
      const uris = result.assets.map((a) => a.uri);
      const pdfUri = await imagesToPdf(uris);
      await Haptic.success();
      openEditor(pdfUri, 'Secure Capture');
    } catch {
      await Haptic.error();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <View style={styles.nav}>
          <View style={styles.brandRow}>
            <Ionicons name="shield-checkmark" size={22} color={AppleDS.accent} />
            <Text style={[typography.navBrand, { marginLeft: 8 }]}>RedactPDF</Text>
          </View>
          <Badge text="Audit Shield On" />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={typography.hero}>
            {'Zero-Trace Pixel\nDestruction & Audit Shield'}
          </Text>
          <Text style={[typography.body, { marginTop: 12 }]}>
            Forensic burn-and-flatten for SSNs, balances, and identities — pixels
            destroyed on-device, metadata wiped before export.
          </Text>

          <View style={{ height: 28 }} />
          <ActionCard
            icon="aperture"
            title="Vault Import"
            subtitle="Pull PDFs into the destruction vault"
            isPrimary
            onPress={busy ? () => undefined : onOpenPdf}
          />
          <View style={{ height: 14 }} />
          <ActionCard
            icon="hardware-chip"
            title="Secure Enclave Capture"
            subtitle="Hardware-secured import of scans & photos"
            onPress={busy ? () => undefined : onOpenPhotos}
          />
          <View style={{ height: 28 }} />
          <TrustBanner text="Zero Cloud Processing • EXIF / Author / Revisions Cleared On Export" />
        </ScrollView>
      </SafeAreaView>
      {busy ? <LoadingOverlay message="Sealing into vault…" /> : null}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  nav: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  content: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 40,
  },
});
