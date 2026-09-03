import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/haptic_service.dart';
import '../services/subscription_manager.dart';
import '../theme/apple_components.dart';
import '../theme/apple_design_system.dart';

class PaywallScreen extends StatefulWidget {
  const PaywallScreen({super.key, this.onPurchaseSuccess});

  final VoidCallback? onPurchaseSuccess;

  @override
  State<PaywallScreen> createState() => _PaywallScreenState();
}

class _PaywallScreenState extends State<PaywallScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _glow;

  @override
  void initState() {
    super.initState();
    _glow = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2400),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _glow.dispose();
    super.dispose();
  }

  Future<void> _purchase() async {
    final manager = context.read<SubscriptionManager>();
    await HapticService.medium();
    await manager.purchaseIntroductoryOffer();
    if (!mounted) return;
    if (manager.isSubscribed) {
      await HapticService.success();
      widget.onPurchaseSuccess?.call();
      if (!mounted) return;
      Navigator.of(context).pop(true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final manager = context.watch<SubscriptionManager>();

    return Scaffold(
      body: Stack(
        children: [
          const AppleScreenBackground(),
          SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 40),
              children: [
                Align(
                  alignment: Alignment.centerRight,
                  child: IconButton(
                    onPressed: () {
                      HapticService.selection();
                      Navigator.of(context).pop(false);
                    },
                    icon: Icon(
                      Icons.cancel,
                      color: AppleDS.labelQuaternary,
                      size: 28,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                AnimatedBuilder(
                  animation: _glow,
                  builder: (context, _) {
                    final t = _glow.value;
                    return Column(
                      children: [
                        Container(
                          width: 108,
                          height: 108,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: AppleDS.accent
                                    .withValues(alpha: 0.08 + t * 0.14),
                                blurRadius: 28,
                                spreadRadius: 4,
                              ),
                            ],
                          ),
                          child: const Icon(
                            Icons.verified_user_rounded,
                            color: AppleDS.accent,
                            size: 56,
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text('RedactPDF Pro', style: AppleDS.title),
                        const SizedBox(height: 8),
                        Text(
                          'Unlock unlimited document exports and permanent metadata sanitization.',
                          style: AppleDS.subheadline,
                          textAlign: TextAlign.center,
                        ),
                      ],
                    );
                  },
                ),
                const SizedBox(height: 28),
                const AppleSectionCard(
                  children: [
                    AppleValuePropRow(
                      icon: Icons.download_rounded,
                      text: 'Unlimited Flattened PDF Exports',
                    ),
                    AppleValuePropRow(
                      icon: Icons.psychology_alt_outlined,
                      text:
                          'Automated AI Detection (SSN, Financials, IDs)',
                    ),
                    AppleValuePropRow(
                      icon: Icons.local_fire_department_rounded,
                      text:
                          'Permanent Pixel-Level Destruction (No copy/paste leaks)',
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                const ApplePricingCard(
                  title: 'Introductory Offer: \$0.49 for 7 Days',
                  subtitle: 'Then \$9.99/week recurring. Cancel anytime.',
                ),
                const SizedBox(height: 20),
                ApplePrimaryButton(
                  title: 'Start 7-Day Access - \$0.49',
                  isLoading: manager.isLoading,
                  onPressed: _purchase,
                ),
                const SizedBox(height: 18),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    TextButton(
                      onPressed: () async {
                        await manager.restorePurchases();
                      },
                      child: Text('Restore Purchases', style: AppleDS.caption),
                    ),
                    Text('•', style: AppleDS.caption),
                    TextButton(
                      onPressed: () => launchUrl(
                        Uri.parse('https://redactpdf.app/terms'),
                      ),
                      child: Text('Terms', style: AppleDS.caption),
                    ),
                    Text('•', style: AppleDS.caption),
                    TextButton(
                      onPressed: () => launchUrl(
                        Uri.parse('https://redactpdf.app/privacy'),
                      ),
                      child: Text('Privacy Policy', style: AppleDS.caption),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
