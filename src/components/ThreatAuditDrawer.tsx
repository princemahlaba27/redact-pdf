import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ThreatCategory, ThreatItem } from '../models/threat';
import {
  THREAT_CATEGORY_ICON,
  THREAT_CATEGORY_LABEL,
} from '../models/threat';
import { Haptic } from '../services/haptics';
import { AppleDS, typography } from '../theme/tokens';

type Props = {
  visible: boolean;
  threats: ThreatItem[];
  onClose: () => void;
  onToggle: (id: string, enabled: boolean) => void;
  onToggleAll: (enabled: boolean) => void;
  onFocusThreat: (threat: ThreatItem) => void;
};

const ORDER: ThreatCategory[] = ['financial', 'contact', 'identity', 'custom'];

/**
 * Interactive Private Details checklist — toggle each hit to add/remove
 * blackout boxes on the canvas in real time.
 */
export function ThreatAuditDrawer({
  visible,
  threats,
  onClose,
  onToggle,
  onToggleAll,
  onFocusThreat,
}: Props) {
  const insets = useSafeAreaInsets();
  const enabledCount = threats.filter((t) => t.enabled).length;
  const allOn = threats.length > 0 && enabledCount === threats.length;

  const grouped = useMemo(() => {
    const map = new Map<ThreatCategory, ThreatItem[]>();
    for (const c of ORDER) map.set(c, []);
    for (const t of threats) {
      const list = map.get(t.category) ?? [];
      list.push(t);
      map.set(t.category, list);
    }
    return ORDER.map((c) => ({ category: c, items: map.get(c) ?? [] })).filter(
      (g) => g.items.length > 0,
    );
  }, [threats]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                Found {threats.length} Private Detail
                {threats.length === 1 ? '' : 's'}
              </Text>
              <Text style={styles.subtitle}>
                {enabledCount} checked to hide · tap a row to jump on the page
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={AppleDS.labelTertiary} />
            </Pressable>
          </View>

          <View style={styles.masterRow}>
            <Text style={styles.masterLabel}>
              {allOn ? 'Deselect All' : 'Select All'}
            </Text>
            <Pressable
              onPress={() => {
                void Haptic.selection();
                onToggleAll(!allOn);
              }}
              style={styles.masterBtn}
            >
              <Text style={styles.masterBtnText}>
                {allOn ? 'Deselect All' : 'Select All'}
              </Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={{ paddingBottom: 12 }}
            showsVerticalScrollIndicator={false}
          >
            {grouped.length === 0 ? (
              <Text style={styles.empty}>
                No private details found in the text layer. Draw a box over
                anything else you want to hide.
              </Text>
            ) : (
              grouped.map((group) => (
                <View key={group.category} style={styles.group}>
                  <View style={styles.groupHeader}>
                    <Ionicons
                      name={
                        THREAT_CATEGORY_ICON[
                          group.category
                        ] as keyof typeof Ionicons.glyphMap
                      }
                      size={15}
                      color={AppleDS.labelTertiary}
                    />
                    <Text style={styles.groupTitle}>
                      {THREAT_CATEGORY_LABEL[group.category]}
                    </Text>
                    <Text style={styles.groupCount}>{group.items.length}</Text>
                  </View>

                  {group.items.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => {
                        void Haptic.selection();
                        onFocusThreat(item);
                      }}
                      style={[styles.row, !item.enabled && styles.rowOff]}
                    >
                      <Pressable
                        onPress={() => {
                          void Haptic.selection();
                          onToggle(item.id, !item.enabled);
                        }}
                        hitSlop={8}
                        style={styles.checkHit}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: item.enabled }}
                      >
                        <Ionicons
                          name={item.enabled ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={
                            item.enabled ? AppleDS.accent : AppleDS.labelQuaternary
                          }
                        />
                      </Pressable>
                      <View style={styles.rowCopy}>
                        <Text style={styles.rowText} numberOfLines={2}>
                          {item.enabled ? '[✓] ' : '[ ] '}
                          {item.displayText || item.text}
                        </Text>
                        <Text style={styles.rowMeta}>
                          {item.badge} · Page {item.pageIndex + 1}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    maxHeight: '78%',
    backgroundColor: AppleDS.surfaceElevated,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppleDS.separator,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
  },
  title: {
    ...typography.headline,
    fontSize: 17,
  },
  subtitle: {
    ...typography.caption,
    marginTop: 4,
    color: AppleDS.labelTertiary,
  },
  masterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppleDS.separator,
    marginBottom: 8,
  },
  masterLabel: {
    ...typography.subheadline,
    color: AppleDS.labelSecondary,
  },
  masterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(10,132,255,0.15)',
  },
  masterBtnText: {
    ...typography.captionMedium,
    color: AppleDS.accent,
  },
  list: { flexGrow: 0 },
  empty: {
    ...typography.footnote,
    textAlign: 'center',
    paddingVertical: 28,
    paddingHorizontal: 12,
  },
  group: { marginBottom: 14 },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  groupTitle: {
    ...typography.captionMedium,
    flex: 1,
    color: AppleDS.labelSecondary,
  },
  groupCount: {
    ...typography.caption,
    color: AppleDS.labelQuaternary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: 8,
  },
  rowOff: {
    opacity: 0.45,
  },
  checkHit: { padding: 2 },
  rowCopy: { flex: 1, gap: 4 },
  rowText: {
    ...typography.footnoteMedium,
    color: AppleDS.labelPrimary,
    fontSize: 15,
  },
  rowMeta: {
    ...typography.caption,
    color: AppleDS.labelQuaternary,
  },
});
