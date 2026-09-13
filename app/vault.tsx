import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton, ScreenBackground } from '../src/components/ui';
import {
  listVaultDocuments,
  type VaultDocument,
} from '../src/services/documentVault';
import { Haptic } from '../src/services/haptics';
import { useSubscription } from '../src/services/subscription';
import { AppleDS, typography } from '../src/theme/tokens';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * On-device document vault — previously exported sanitized PDFs.
 * Locked behind redact_pdf_pro so canceling a subscription gates re-access.
 */
export default function VaultScreen() {
  const router = useRouter();
  const isSubscribed = useSubscription((s) => s.isSubscribed);
  const checkStatus = useSubscription((s) => s.checkStatus);
  const [docs, setDocs] = useState<VaultDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await checkStatus();
      setDocs(await listVaultDocuments());
    } finally {
      setLoading(false);
    }
  }, [checkStatus]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const onShare = async (doc: VaultDocument) => {
    await Haptic.medium();
    if (!(await Sharing.isAvailableAsync())) return;
    await Sharing.shareAsync(doc.uri, {
      mimeType: 'application/pdf',
      dialogTitle: doc.title,
      UTI: 'com.adobe.pdf',
    });
  };

  const onUnlock = async () => {
    await Haptic.selection();
    router.push({
      pathname: '/paywall',
      params: { title: 'Document Vault' },
    });
  };

  return (
    <ScreenBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              void Haptic.selection();
              router.back();
            }}
            hitSlop={12}
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={22} color={AppleDS.accent} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.title}>Recent Documents</Text>
          <Text style={styles.subtitle}>
            Sanitized PDFs saved on this iPhone
          </Text>
        </View>

        {!isSubscribed ? (
          <View style={styles.locked}>
            <View style={styles.lockRing}>
              <Ionicons name="folder" size={36} color={AppleDS.labelPrimary} />
            </View>
            <Text style={styles.lockedTitle}>Document Vault Locked</Text>
            <Text style={styles.lockedBody}>
              Subscribe to reopen your saved redacted files for sharing, print,
              or review. Canceling removes mobile access to this vault.
            </Text>
            <PrimaryButton
              title="Subscribe to Unlock Vault"
              onPress={() => void onUnlock()}
              style={styles.unlockCta}
            />
            {docs.length > 0 ? (
              <Text style={styles.lockedHint}>
                {docs.length} document{docs.length === 1 ? '' : 's'} waiting in
                your vault
              </Text>
            ) : null}
          </View>
        ) : loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={AppleDS.accent} />
          </View>
        ) : docs.length === 0 ? (
          <View style={styles.center}>
            <Ionicons
              name="documents-outline"
              size={40}
              color={AppleDS.labelTertiary}
            />
            <Text style={styles.emptyTitle}>No saved documents yet</Text>
            <Text style={styles.emptyBody}>
              Exported blackout PDFs appear here automatically.
            </Text>
          </View>
        ) : (
          <FlatList
            data={docs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable style={styles.row} onPress={() => void onShare(item)}>
                <View style={styles.thumb}>
                  <Ionicons
                    name="document-text"
                    size={22}
                    color={AppleDS.accent}
                  />
                </View>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {formatDate(item.createdAt)}
                    {item.sizeBytes > 0
                      ? ` · ${formatBytes(item.sizeBytes)}`
                      : ''}
                  </Text>
                </View>
                <Ionicons
                  name="share-outline"
                  size={20}
                  color={AppleDS.labelTertiary}
                />
              </Pressable>
            )}
          />
        )}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppleDS.separator,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: 44,
    marginLeft: -4,
    gap: 2,
  },
  backText: {
    ...typography.body,
    color: AppleDS.accent,
    fontSize: 17,
  },
  title: {
    ...typography.title,
    fontSize: 28,
    marginTop: 4,
  },
  subtitle: {
    ...typography.footnote,
    marginTop: 4,
    color: AppleDS.labelTertiary,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: AppleDS.radius.md,
    backgroundColor: AppleDS.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppleDS.separator,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,132,255,0.14)',
  },
  rowCopy: { flex: 1, gap: 4 },
  rowTitle: {
    ...typography.headline,
    fontSize: 16,
  },
  rowMeta: {
    ...typography.caption,
    color: AppleDS.labelTertiary,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    ...typography.headline,
    marginTop: 8,
  },
  emptyBody: {
    ...typography.footnote,
    textAlign: 'center',
    color: AppleDS.labelTertiary,
  },
  locked: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  lockRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    marginBottom: 18,
  },
  lockedTitle: {
    ...typography.title,
    fontSize: 22,
    textAlign: 'center',
  },
  lockedBody: {
    ...typography.subheadline,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 21,
    color: AppleDS.labelSecondary,
  },
  unlockCta: {
    marginTop: 24,
    alignSelf: 'stretch',
  },
  lockedHint: {
    ...typography.caption,
    marginTop: 14,
    color: AppleDS.labelTertiary,
  },
});
