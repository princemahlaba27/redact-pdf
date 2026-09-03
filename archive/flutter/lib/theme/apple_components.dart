import 'package:flutter/material.dart';

import 'apple_design_system.dart';

class AppleScreenBackground extends StatelessWidget {
  const AppleScreenBackground({super.key});

  @override
  Widget build(BuildContext context) {
    return const DecoratedBox(
      decoration: BoxDecoration(
        color: AppleDS.canvas,
        gradient: RadialGradient(
          center: Alignment.topLeft,
          radius: 1.2,
          colors: [
            Color(0x120A85FF),
            Colors.transparent,
          ],
        ),
      ),
      child: SizedBox.expand(),
    );
  }
}

class AppleBadge extends StatelessWidget {
  const AppleBadge({
    super.key,
    required this.text,
    this.showDot = true,
  });

  final String text;
  final bool showDot;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(100),
        border: Border.all(color: AppleDS.separatorOpaque),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (showDot) ...[
            Container(
              width: 7,
              height: 7,
              decoration: const BoxDecoration(
                color: AppleDS.success,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 6),
          ],
          Text(text, style: AppleDS.captionMedium),
        ],
      ),
    );
  }
}

class AppleActionCard extends StatefulWidget {
  const AppleActionCard({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.isPrimary = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool isPrimary;

  @override
  State<AppleActionCard> createState() => _AppleActionCardState();
}

class _AppleActionCardState extends State<AppleActionCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: (_) => setState(() => _pressed = true),
      onTapUp: (_) => setState(() => _pressed = false),
      onTapCancel: () => setState(() => _pressed = false),
      onTap: widget.onTap,
      child: AnimatedScale(
        scale: _pressed ? 0.985 : 1,
        duration: const Duration(milliseconds: 140),
        curve: Curves.easeOutCubic,
        child: Container(
          padding: const EdgeInsets.all(AppleDS.cardPadding),
          decoration: BoxDecoration(
            color: widget.isPrimary
                ? AppleDS.accentMuted.withValues(alpha: 0.35)
                : Colors.white.withValues(alpha: 0.04),
            borderRadius: BorderRadius.circular(AppleDS.radiusLg),
            border: Border.all(
              color: widget.isPrimary
                  ? AppleDS.accent.withValues(alpha: 0.35)
                  : AppleDS.separatorOpaque,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: AppleDS.iconContainer,
                height: AppleDS.iconContainer,
                decoration: BoxDecoration(
                  color: widget.isPrimary
                      ? AppleDS.accentMuted
                      : Colors.white.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(AppleDS.radiusIcon),
                ),
                child: Icon(
                  widget.icon,
                  color: widget.isPrimary
                      ? AppleDS.accent
                      : AppleDS.labelPrimary.withValues(alpha: 0.88),
                  size: 22,
                ),
              ),
              const SizedBox(width: AppleDS.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(widget.title, style: AppleDS.headline),
                    const SizedBox(height: 4),
                    Text(widget.subtitle, style: AppleDS.footnote),
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                color: AppleDS.labelQuaternary,
                size: 22,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class AppleTrustBanner extends StatelessWidget {
  const AppleTrustBanner({
    super.key,
    required this.icon,
    required this.text,
  });

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
      decoration: BoxDecoration(
        color: AppleDS.successMuted.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppleDS.separatorOpaque),
      ),
      child: Row(
        children: [
          Icon(icon, color: AppleDS.success, size: 16),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text, style: AppleDS.footnoteMedium),
          ),
        ],
      ),
    );
  }
}

class ApplePrimaryButton extends StatelessWidget {
  const ApplePrimaryButton({
    super.key,
    required this.title,
    required this.onPressed,
    this.isLoading = false,
    this.enabled = true,
  });

  final String title;
  final VoidCallback? onPressed;
  final bool isLoading;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: AppleDS.minTouchTarget + 6,
      child: FilledButton(
        onPressed: (!enabled || isLoading) ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: AppleDS.accent,
          disabledBackgroundColor: AppleDS.accent.withValues(alpha: 0.4),
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppleDS.radiusMd),
          ),
        ),
        child: isLoading
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2.2,
                  color: Colors.white,
                ),
              )
            : Text(title, style: AppleDS.headline.copyWith(color: Colors.white)),
      ),
    );
  }
}

class AppleFloatingToolbar extends StatelessWidget {
  const AppleFloatingToolbar({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: AppleDS.surfaceGrouped.withValues(alpha: 0.92),
          borderRadius: BorderRadius.circular(100),
          border: Border.all(color: AppleDS.separatorOpaque),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.35),
              blurRadius: 24,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: child,
      ),
    );
  }
}

class AppleLoadingOverlay extends StatelessWidget {
  const AppleLoadingOverlay({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.black.withValues(alpha: 0.42),
      child: Center(
        child: Container(
          padding: const EdgeInsets.all(28),
          decoration: BoxDecoration(
            color: AppleDS.surfaceGrouped,
            borderRadius: BorderRadius.circular(AppleDS.radiusMd),
            border: Border.all(color: AppleDS.separatorOpaque),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const CircularProgressIndicator(color: Colors.white),
              const SizedBox(height: 12),
              Text(message, style: AppleDS.subheadline),
            ],
          ),
        ),
      ),
    );
  }
}

class AppleSectionCard extends StatelessWidget {
  const AppleSectionCard({super.key, required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(AppleDS.lg),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.04),
        borderRadius: BorderRadius.circular(AppleDS.radiusLg),
        border: Border.all(color: AppleDS.separatorOpaque),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0) const SizedBox(height: AppleDS.md),
            children[i],
          ],
        ],
      ),
    );
  }
}

class AppleValuePropRow extends StatelessWidget {
  const AppleValuePropRow({
    super.key,
    required this.icon,
    required this.text,
  });

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Icon(Icons.check_circle, color: AppleDS.success, size: 18),
        const SizedBox(width: 10),
        Icon(icon, color: AppleDS.accent, size: 16),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: AppleDS.subheadline.copyWith(
              color: AppleDS.labelPrimary.withValues(alpha: 0.88),
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
      ],
    );
  }
}

class ApplePricingCard extends StatelessWidget {
  const ApplePricingCard({
    super.key,
    required this.title,
    required this.subtitle,
  });

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 22),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(AppleDS.radiusLg),
        border: Border.all(color: AppleDS.accent.withValues(alpha: 0.55), width: 2),
        boxShadow: [
          BoxShadow(
            color: AppleDS.accent.withValues(alpha: 0.18),
            blurRadius: 16,
          ),
        ],
      ),
      child: Column(
        children: [
          Text(title, style: AppleDS.headline, textAlign: TextAlign.center),
          const SizedBox(height: 8),
          Text(subtitle, style: AppleDS.footnote, textAlign: TextAlign.center),
        ],
      ),
    );
  }
}
