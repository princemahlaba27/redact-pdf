import 'package:flutter/services.dart';

class HapticService {
  HapticService._();

  static Future<void> light() => HapticFeedback.lightImpact();
  static Future<void> medium() => HapticFeedback.mediumImpact();
  static Future<void> selection() => HapticFeedback.selectionClick();
  static Future<void> success() => HapticFeedback.heavyImpact();
  static Future<void> warning() => HapticFeedback.mediumImpact();
  static Future<void> error() => HapticFeedback.vibrate();
}
