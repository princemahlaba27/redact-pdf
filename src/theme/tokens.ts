import { ColorValue } from 'react-native';

/** Apple HIG–inspired design tokens for RedactPDF. */
export const AppleDS = {
  canvas: '#0B0B0C',
  surface: '#0D0D0E',
  surfaceElevated: '#141416',
  surfaceGrouped: '#1C1C1E',

  labelPrimary: '#FFFFFF',
  labelSecondary: 'rgba(255,255,255,0.62)',
  labelTertiary: 'rgba(255,255,255,0.42)',
  labelQuaternary: 'rgba(255,255,255,0.28)',

  separator: 'rgba(255,255,255,0.10)',
  separatorOpaque: 'rgba(255,255,255,0.08)',

  accent: '#0A85FF',
  accentMuted: 'rgba(10,133,255,0.18)',
  success: '#33D66B',
  successMuted: 'rgba(51,214,107,0.16)',

  spacing: { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 40 },
  radius: { sm: 12, md: 16, lg: 20, xl: 24, icon: 14 },
  layout: { minTouch: 44, screenPadding: 20, cardPadding: 18, iconSize: 52 },
} as const;

export const typography = {
  hero: {
    fontSize: 34,
    fontWeight: '700' as const,
    lineHeight: 40,
    letterSpacing: -0.5,
    color: AppleDS.labelPrimary,
  },
  navBrand: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: AppleDS.labelPrimary,
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: AppleDS.labelPrimary,
  },
  headline: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: AppleDS.labelPrimary,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 22,
    color: AppleDS.labelSecondary as ColorValue,
  },
  subheadline: {
    fontSize: 15,
    fontWeight: '400' as const,
    color: AppleDS.labelSecondary as ColorValue,
  },
  footnote: {
    fontSize: 13,
    fontWeight: '400' as const,
    color: AppleDS.labelTertiary as ColorValue,
  },
  footnoteMedium: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: AppleDS.labelTertiary as ColorValue,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    color: AppleDS.labelQuaternary as ColorValue,
  },
  captionMedium: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: AppleDS.labelSecondary as ColorValue,
  },
};
