import { ColorValue } from 'react-native';

/**
 * Native Apple dark utility palette — pitch black canvas, system gray cards.
 */
export const AppleDS = {
  canvas: '#000000',
  surface: '#000000',
  surfaceElevated: '#1C1C1E',
  surfaceGrouped: '#1C1C1E',

  labelPrimary: '#FFFFFF',
  labelSecondary: 'rgba(235,235,245,0.6)',
  labelTertiary: 'rgba(235,235,245,0.4)',
  labelQuaternary: 'rgba(235,235,245,0.28)',

  separator: 'rgba(84,84,88,0.65)',
  separatorOpaque: '#38383A',

  accent: '#0A84FF',
  accentMuted: 'rgba(10,132,255,0.18)',
  success: '#30D158',
  successMuted: 'rgba(48,209,88,0.16)',
  danger: '#FF453A',
  amber: '#FFD60A',
  labelMuted: 'rgba(235,235,245,0.4)',

  spacing: { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 40 },
  radius: { sm: 10, md: 12, lg: 14, xl: 18, icon: 12 },
  layout: { minTouch: 44, screenPadding: 24, cardPadding: 16, iconSize: 44 },
} as const;

export const typography = {
  hero: {
    fontSize: 28,
    fontWeight: '700' as const,
    lineHeight: 34,
    letterSpacing: -0.4,
    color: AppleDS.labelPrimary,
  },
  navBrand: {
    fontSize: 22,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
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
