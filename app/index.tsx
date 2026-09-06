import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import {
  ActionCard,
  LoadingOverlay,
  ScreenBackground,
} from '../src/components/ui';
import { Haptic } from '../src/services/haptics';
import { processImagesForRedaction } from '../src/services/imagePipeline';
import { cachePdfUri } from '../src/services/redactionEngine';
import { AppleDS, typography } from '../src/theme/tokens';

/**
 * Home dashboard — title at top with breathing room, action cards centered
 * in the remaining space, privacy note pinned above the home indicator
 * (image_15 layout polish).
 */
export default function DashboardScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  /** Open the editor directly — real pdf.js OCR runs there (no mock scan). */
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
      const cachedUri = await cachePdfUri(asset.uri);
      await Haptic.success();
      openEditor(
        cachedUri,
        asset.name?.replace(/\.pdf$/i, '') || 'Document',
      );
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
      // Image pipeline: upright JPEG → Apple Vision OCR → PDF canvas
      const { pdfUri } = await processImagesForRedaction(uris);
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
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.header}>
          <Text style={typography.navBrand}>Redact PDF</Text>
          <Text style={styles.subtitle}>
            Select a document to hide private details.
          </Text>
        </View>

        <View style={styles.centerColumn}>
          <View style={styles.actions}>
            <ActionCard
              icon="document-text"
              title="Select Document"
              subtitle="PDF files, statements, tax forms"
              isPrimary
              onPress={busy ? () => undefined : onOpenPdf}
            />
            <View style={{ height: 16 }} />
            <ActionCard
              icon="camera"
              title="Select Photo or Scan"
              subtitle="Images, screenshots, camera scans"
              onPress={busy ? () => undefined : onOpenPhotos}
            />
          </View>
        </View>

        <View style={styles.footer}>
          <Ionicons
            name="lock-closed"
            size={14}
            color={AppleDS.labelTertiary}
          />
          <Text style={styles.footerText}>
            Your documents never leave your phone.
          </Text>
        </View>
      </SafeAreaView>
      {busy ? (
        <LoadingOverlay message="Reading private details on-device…" />
      ) : null}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  subtitle: {
    ...typography.body,
    marginTop: 10,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  centerColumn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
    paddingHorizontal: 24,
  },
  actions: {
    width: '100%',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 8,
  },
  footerText: {
    ...typography.footnote,
    color: AppleDS.labelTertiary,
  },
});
