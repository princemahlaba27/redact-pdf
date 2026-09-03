import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export const Haptic = {
  light: () => {
    if (Platform.OS === 'web') return;
    return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  medium: () => {
    if (Platform.OS === 'web') return;
    return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },
  selection: () => {
    if (Platform.OS === 'web') return;
    return Haptics.selectionAsync();
  },
  success: () => {
    if (Platform.OS === 'web') return;
    return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  },
  warning: () => {
    if (Platform.OS === 'web') return;
    return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  },
  error: () => {
    if (Platform.OS === 'web') return;
    return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  },
};
