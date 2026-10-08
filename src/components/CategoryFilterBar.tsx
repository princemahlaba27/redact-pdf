import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import {
  REDACTION_FILTERS,
  threatInFilter,
  type RedactionFilterId,
  type ThreatItem,
} from '../models/threat';
import { AppleDS } from '../theme/tokens';

type Props = {
  threats: ThreatItem[];
  onToggle: (filter: RedactionFilterId) => void;
};

function chipOn(threats: ThreatItem[], id: RedactionFilterId): boolean {
  if (threats.length === 0) return id === 'all';
  if (id === 'all') return threats.every((item) => item.enabled);
  const matching = threats.filter((item) => threatInFilter(item, id));
  return matching.length > 0 && matching.every((item) => item.enabled);
}

export function CategoryFilterBar({ threats, onToggle }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroller}
      contentContainerStyle={styles.row}
    >
      {REDACTION_FILTERS.map((filter) => {
        const on = chipOn(threats, filter.id);
        return (
          <Pressable
            key={filter.id}
            onPress={() => onToggle(filter.id)}
            style={[styles.chip, on && styles.chipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{filter.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroller: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 48,
    height: 48,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: AppleDS.separator,
  },
  chipOn: {
    backgroundColor: 'rgba(10,132,255,0.2)',
    borderColor: AppleDS.accent,
  },
  label: {
    color: AppleDS.labelSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  labelOn: {
    color: AppleDS.labelPrimary,
  },
});
