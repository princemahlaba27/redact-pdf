import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenBackground } from '../components/ui';
import type { LegalDocument } from '../legal/policies';
import { Haptic } from '../services/haptics';
import { AppleDS, typography } from '../theme/tokens';

type Props = {
  document: LegalDocument;
};

/**
 * Shared in-app legal document reader (Privacy / Terms).
 */
export function LegalDocumentScreen({ document }: Props) {
  const router = useRouter();

  return (
    <ScreenBackground>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              void Haptic.selection();
              if (router.canGoBack()) router.back();
              else router.replace('/');
            }}
            hitSlop={12}
            accessibilityLabel="Close"
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={22} color={AppleDS.accent} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{document.title}</Text>
          <Text style={styles.updated}>Last Updated: {document.lastUpdated}</Text>

          {document.sections.map((section) => (
            <View key={section.heading} style={styles.section}>
              <Text style={styles.heading}>{section.heading}</Text>
              {section.blocks.map((block, idx) => {
                if (block.type === 'paragraph') {
                  return (
                    <Text key={`${section.heading}-p-${idx}`} style={styles.body}>
                      {block.text}
                    </Text>
                  );
                }
                if (block.type === 'bullet') {
                  return (
                    <View
                      key={`${section.heading}-b-${idx}`}
                      style={styles.bulletRow}
                    >
                      <Text style={styles.bulletMark}>•</Text>
                      <Text style={[styles.body, styles.bulletText]}>
                        {block.text}
                      </Text>
                    </View>
                  );
                }
                return (
                  <Pressable
                    key={`${section.heading}-l-${idx}`}
                    onPress={() => {
                      void Haptic.selection();
                      void Linking.openURL(block.url);
                    }}
                    style={styles.linkHit}
                  >
                    <Text style={styles.link}>{block.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppleDS.separator,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: 4,
    gap: 2,
  },
  backText: {
    ...typography.body,
    color: AppleDS.accent,
    fontSize: 17,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 48,
  },
  title: {
    ...typography.title,
    fontSize: 28,
    letterSpacing: -0.4,
  },
  updated: {
    ...typography.footnote,
    marginTop: 8,
    marginBottom: 8,
    color: AppleDS.labelTertiary,
  },
  section: {
    marginTop: 22,
    gap: 10,
  },
  heading: {
    ...typography.headline,
    fontSize: 17,
    marginBottom: 2,
  },
  body: {
    ...typography.body,
    fontSize: 15,
    lineHeight: 22,
    color: AppleDS.labelSecondary,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingRight: 4,
  },
  bulletMark: {
    ...typography.body,
    color: AppleDS.labelSecondary,
    lineHeight: 22,
    width: 12,
  },
  bulletText: { flex: 1 },
  linkHit: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  link: {
    ...typography.body,
    color: AppleDS.accent,
    fontSize: 15,
    textDecorationLine: 'underline',
  },
});
