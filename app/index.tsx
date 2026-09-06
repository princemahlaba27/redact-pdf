import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import {
  ActionCard,
  LoadingOverlay,
  ScreenBackground,
} from '../src/components/ui';
import { Haptic } from '../src/services/haptics';
import { cachePdfUri, imagesToPdf } from '../src/services/redactionEngine';
import { AppleDS, typography } from '../src/theme/tokens';

export default function DashboardScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const openThermalScan = (nextUri: string, nextTitle: string) => {
    router.push({
      pathname: '/thermal-scan',
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
      const cachedUri = await cachePdfUri(asset.uri);
      await Haptic.success();
      openThermalScan(cachedUri, asset.name?.replace(/\.pdf$/i, '') || 'Document');
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
      openThermalScan(pdfUri, 'Scan');
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
          <Text style={typography.navBrand}>Redact PDF</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.subtitle}>
            Select a document to hide private details.
          </Text>

          <View style={{ height: 28 }} />
          <ActionCard
            icon="document-text"
            title="Select Document"
            subtitle="PDF files, statements, tax forms"
            isPrimary
            onPress={busy ? () => undefined : onOpenPdf}
          />
          <View style={{ height: 12 }} />
          <ActionCard
            icon="camera"
            title="Select Photo or Scan"
            subtitle="Images, screenshots, camera scans"
            onPress={busy ? () => undefined : onOpenPhotos}
          />

          <View style={styles.privacyNote}>
            <Ionicons
              name="lock-closed"
              size={14}
              color={AppleDS.labelTertiary}
            />
            <Text style={styles.privacyText}>
              Your documents never leave your phone.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
      {busy ? <LoadingOverlay message="Opening document…" /> : null}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  nav: {
    paddingHorizontal: AppleDS.layout.screenPadding,
    paddingTop: 8,
    paddingBottom: 4,
  },
  content: {
    paddingHorizontal: AppleDS.layout.screenPadding,
    paddingTop: 12,
    paddingBottom: 40,
  },
  subtitle: {
    ...typography.body,
    marginTop: 4,
  },
  privacyNote: {
    marginTop: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  privacyText: {
    ...typography.footnote,
    color: AppleDS.labelTertiary,
  },
});
