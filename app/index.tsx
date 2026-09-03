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
import { imagesToPdf } from '../src/services/redactionEngine';
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
    await Haptic.success();
    openEditor(asset.uri, asset.name?.replace(/\.pdf$/i, '') || 'Document');
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
      openEditor(pdfUri, 'Scan');
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
            <Ionicons name="document-text" size={22} color={AppleDS.accent} />
            <Text style={[typography.navBrand, { marginLeft: 8 }]}>RedactPDF</Text>
          </View>
          <Badge text="100% On-Device" />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={typography.hero}>
            {'Sanitize documents.\nKeep data private.'}
          </Text>
          <Text style={[typography.body, { marginTop: 12 }]}>
            Permanently black out text, SSNs, and financials with on-device
            pixel-burning.
          </Text>

          <View style={{ height: 28 }} />
          <ActionCard
            icon="document"
            title="Open PDF Document"
            subtitle="Contracts, tax forms, statements"
            isPrimary
            onPress={busy ? () => undefined : onOpenPdf}
          />
          <View style={{ height: 14 }} />
          <ActionCard
            icon="images-outline"
            title="Select Photo or Scan"
            subtitle="Import scanned pages as PDF"
            onPress={busy ? () => undefined : onOpenPhotos}
          />
          <View style={{ height: 28 }} />
          <TrustBanner text="Zero Cloud Processing • Metadata Flattened On Export" />
        </ScrollView>
      </SafeAreaView>
      {busy ? <LoadingOverlay message="Preparing document…" /> : null}
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
