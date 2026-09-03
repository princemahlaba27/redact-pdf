import 'package:flutter/material.dart';

/// Apple HIG–inspired design tokens for RedactPDF.
/// Content sits on solid surfaces; controls float on translucent materials.
class AppleDS {
  AppleDS._();

  // Colors
  static const Color canvas = Color(0xFF0B0B0C);
  static const Color surface = Color(0xFF0D0D0E);
  static const Color surfaceElevated = Color(0xFF141416);
  static const Color surfaceGrouped = Color(0xFF1C1C1E);

  static const Color labelPrimary = Colors.white;
  static const Color labelSecondary = Color(0x9EFFFFFF);
  static const Color labelTertiary = Color(0x6BFFFFFF);
  static const Color labelQuaternary = Color(0x47FFFFFF);

  static const Color separator = Color(0x1AFFFFFF);
  static const Color separatorOpaque = Color(0x14FFFFFF);

  static const Color accent = Color(0xFF0A85FF);
  static const Color accentMuted = Color(0x2E0A85FF);
  static const Color success = Color(0xFF33D66B);
  static const Color successMuted = Color(0x2933D66B);

  static TextStyle get hero => const TextStyle(
        fontSize: 34,
        fontWeight: FontWeight.w700,
        height: 1.15,
        letterSpacing: -0.5,
        color: labelPrimary,
      );

  static TextStyle get navBrand => const TextStyle(
        fontSize: 20,
        fontWeight: FontWeight.w700,
        color: labelPrimary,
      );

  static TextStyle get title => const TextStyle(
        fontSize: 28,
        fontWeight: FontWeight.w700,
        color: labelPrimary,
      );

  static TextStyle get headline => const TextStyle(
        fontSize: 17,
        fontWeight: FontWeight.w600,
        color: labelPrimary,
      );

  static TextStyle get body => const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w400,
        height: 1.4,
        color: labelSecondary,
      );

  static TextStyle get subheadline => const TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w400,
        color: labelSecondary,
      );

  static TextStyle get footnote => const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w400,
        color: labelTertiary,
      );

  static TextStyle get footnoteMedium => const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w500,
        color: labelTertiary,
      );

  static TextStyle get caption => const TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w400,
        color: labelQuaternary,
      );

  static TextStyle get captionMedium => const TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        color: labelSecondary,
      );

  static const double xxs = 4;
  static const double xs = 8;
  static const double sm = 12;
  static const double md = 16;
  static const double lg = 20;
  static const double xl = 24;
  static const double xxl = 32;
  static const double xxxl = 40;

  static const double radiusSm = 12;
  static const double radiusMd = 16;
  static const double radiusLg = 20;
  static const double radiusXl = 24;
  static const double radiusIcon = 14;

  static const double minTouchTarget = 44;
  static const double screenPadding = 20;
  static const double cardPadding = 18;
  static const double iconContainer = 52;

  static ThemeData get darkTheme => ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: canvas,
        colorScheme: const ColorScheme.dark(
          primary: accent,
          surface: surface,
          onSurface: labelPrimary,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: canvas,
          foregroundColor: labelPrimary,
          elevation: 0,
          centerTitle: true,
        ),
      );
}
