import { SeasonalTheme } from '../enums/seasonal-theme.enum';
import type { StorefrontTheme } from '../entities/storefront-theme.entity';

export const THEME_GREETINGS: Record<
  SeasonalTheme,
  { headline: string; message: string }
> = {
  DEFAULT: { headline: '', message: '' },
  AVURUDU: {
    headline: 'A fresh start, together.',
    message:
      'Wishing you a joyful Sinhala & Tamil New Year, from all of us at Appliances.lk.',
  },
  CHRISTMAS: {
    headline: 'A little wonder. A lot of joy.',
    message:
      'Wishing you a warm and wonderful Christmas, filled with the people and things you love.',
  },
  HALLOWEEN: {
    headline: 'Good things, with a little mischief.',
    message:
      'A playful twist on your everyday favourites. Happy Halloween from Appliances.lk.',
  },
  EASTER: {
    headline: 'Make room for brighter days.',
    message:
      'Wishing you a peaceful Easter and a season full of fresh beginnings.',
  },
};

export function defaultThemeSettings() {
  return {
    id: 1,
    theme: SeasonalTheme.DEFAULT,
    headline: '',
    message: '',
    showGreeting: true,
    decorations: true,
    animations: true,
    startsAt: null,
    endsAt: null,
    version: 0,
    updatedBy: null,
    updatedAt: new Date(0),
    editor: null,
  } satisfies StorefrontTheme;
}

export function resolveTheme(settings: StorefrontTheme, now = new Date()) {
  const upcoming =
    settings.theme !== SeasonalTheme.DEFAULT &&
    settings.startsAt !== null &&
    settings.startsAt.getTime() > now.getTime();
  const ended =
    settings.endsAt !== null && settings.endsAt.getTime() <= now.getTime();
  const theme = upcoming || ended ? SeasonalTheme.DEFAULT : settings.theme;
  return {
    theme,
    headline:
      theme === SeasonalTheme.DEFAULT
        ? ''
        : settings.headline || THEME_GREETINGS[theme].headline,
    message:
      theme === SeasonalTheme.DEFAULT
        ? ''
        : settings.message || THEME_GREETINGS[theme].message,
    showGreeting: theme !== SeasonalTheme.DEFAULT && settings.showGreeting,
    decorations: theme !== SeasonalTheme.DEFAULT && settings.decorations,
    animations: theme !== SeasonalTheme.DEFAULT && settings.animations,
    nextChangeAt: upcoming
      ? settings.startsAt!.toISOString()
      : !ended && theme !== SeasonalTheme.DEFAULT && settings.endsAt
        ? settings.endsAt.toISOString()
        : null,
    serverTime: now.toISOString(),
  };
}
