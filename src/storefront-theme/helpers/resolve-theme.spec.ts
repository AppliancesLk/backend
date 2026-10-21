import { SeasonalTheme } from '../enums/seasonal-theme.enum';
import {
  defaultThemeSettings,
  resolveTheme,
  THEME_GREETINGS,
} from './resolve-theme';
describe('Seasonal theme scheduling', () => {
  const start = new Date('2026-12-24T12:30:00Z');
  const end = new Date('2026-12-26T18:30:00Z');
  it('keeps Default free of greetings and decorations', () => {
    expect(
      resolveTheme(
        { ...defaultThemeSettings(), headline: 'Ignored', message: 'Ignored' },
        start,
      ),
    ).toMatchObject({
      theme: 'DEFAULT',
      headline: '',
      message: '',
      showGreeting: false,
      decorations: false,
      animations: false,
      nextChangeAt: null,
    });
  });
  it.each([
    SeasonalTheme.AVURUDU,
    SeasonalTheme.CHRISTMAS,
    SeasonalTheme.HALLOWEEN,
    SeasonalTheme.EASTER,
  ])('provides a complete default greeting for %s', (theme) => {
    const result = resolveTheme({ ...defaultThemeSettings(), theme }, start);
    expect(result).toMatchObject({
      theme,
      ...THEME_GREETINGS[theme],
      decorations: true,
      showGreeting: true,
    });
  });
  it('starts inclusively and ends exclusively without a scheduled job', () => {
    const settings = {
      ...defaultThemeSettings(),
      theme: SeasonalTheme.CHRISTMAS,
      startsAt: start,
      endsAt: end,
    };
    expect(resolveTheme(settings, new Date(start.getTime() - 1))).toMatchObject(
      { theme: 'DEFAULT', nextChangeAt: start.toISOString() },
    );
    expect(resolveTheme(settings, start)).toMatchObject({
      theme: 'CHRISTMAS',
      nextChangeAt: end.toISOString(),
    });
    expect(resolveTheme(settings, new Date(end.getTime() - 1)).theme).toBe(
      'CHRISTMAS',
    );
    expect(resolveTheme(settings, end)).toMatchObject({
      theme: 'DEFAULT',
      nextChangeAt: null,
      headline: '',
      decorations: false,
    });
  });
  it('preserves custom text and independent visibility settings', () => {
    const result = resolveTheme(
      {
        ...defaultThemeSettings(),
        theme: SeasonalTheme.EASTER,
        headline: '<b>Peace & joy</b>',
        message: 'A custom greeting',
        showGreeting: false,
        decorations: false,
        animations: false,
      },
      start,
    );
    expect(result).toMatchObject({
      theme: 'EASTER',
      headline: '<b>Peace & joy</b>',
      message: 'A custom greeting',
      showGreeting: false,
      decorations: false,
      animations: false,
    });
  });
});
