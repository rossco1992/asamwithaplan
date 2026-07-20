/**
 * Design tokens derived from the sibling web artifact (artifacts/marrymap/src/index.css).
 * Cream background · Navy primary · Rust accent
 */

const colors = {
  light: {
    // Legacy aliases
    text: '#192034',
    tint: '#c28070',

    // Core surfaces
    background: '#faf9f5',
    foreground: '#192034',

    // Cards
    card: '#ffffff',
    cardForeground: '#192034',

    // Primary — deep navy
    primary: '#192034',
    primaryForeground: '#faf9f5',

    // Secondary
    secondary: '#eeeae7',
    secondaryForeground: '#192034',

    // Muted
    muted: '#f2f0ed',
    mutedForeground: '#525c7a',

    // Accent — rust/terra cotta
    accent: '#c28070',
    accentForeground: '#ffffff',

    // Destructive
    destructive: '#dc2626',
    destructiveForeground: '#ffffff',

    // Borders & inputs
    border: '#ded9d3',
    input: '#ded9d3',
  },

  // Border radius — slightly larger than web's 4px for comfortable mobile touch
  radius: 10,
};

export const fonts = {
  serif: 'PlayfairDisplay_400Regular',
  serifMedium: 'PlayfairDisplay_500Medium',
  serifBold: 'PlayfairDisplay_700Bold',
  serifItalic: 'PlayfairDisplay_400Regular_Italic',
  sans: 'DMSans_400Regular',
  sansMedium: 'DMSans_500Medium',
  sansSemiBold: 'DMSans_600SemiBold',
};

export default colors;
