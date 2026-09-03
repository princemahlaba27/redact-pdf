import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Subscription gate for export interception.
/// Wire Superwall / RevenueCat / Play Billing when API keys are ready.
class SubscriptionManager extends ChangeNotifier {
  SubscriptionManager._();
  static final SubscriptionManager instance = SubscriptionManager._();

  static const _prefsKey = 'redactpdf_is_subscribed';
  static const superwallApiKey = String.fromEnvironment(
    'SUPERWALL_API_KEY',
    defaultValue: '',
  );

  bool _isSubscribed = false;
  bool _isLoading = false;

  bool get isSubscribed => _isSubscribed;
  bool get isLoading => _isLoading;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _isSubscribed = prefs.getBool(_prefsKey) ?? false;
    notifyListeners();
  }

  Future<void> _persist(bool value) async {
    _isSubscribed = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_prefsKey, value);
    notifyListeners();
  }

  /// Returns true when the user may export.
  Future<bool> requestExportAccess() async {
    if (_isSubscribed) return true;
    return false;
  }

  Future<void> purchaseIntroductoryOffer() async {
    _isLoading = true;
    notifyListeners();
    try {
      // TODO: Replace with Superwall / Play Billing / StoreKit purchase.
      // For local QA and Android sideload testing, unlock after "purchase".
      await Future<void>.delayed(const Duration(milliseconds: 600));
      await _persist(true);
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> restorePurchases() async {
    _isLoading = true;
    notifyListeners();
    try {
      await Future<void>.delayed(const Duration(milliseconds: 400));
      // Restore would query the store; keep current local state for now.
      notifyListeners();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Debug helper — clear entitlement.
  Future<void> clearSubscriptionForTesting() => _persist(false);
}
