# Seasonal themes

The `storefront-theme` module stores one selected occasion for the entire site: `DEFAULT`, `AVURUDU`, `CHRISTMAS`, `HALLOWEEN`, or `EASTER` (Pasku).

Run the normal migrations before deploying the backend:

```sh
npm run migration:run -- -d src/database/data-source.ts
```

`1792500000000-StorefrontSeasonalTheme` creates and seeds the singleton configuration with Default. `1792500100000-SeasonalThemeAnimations` adds the animation switch. No environment variables or background worker are required. Seasonal selection controls decorations and banners; it does not change the site color scheme.

## API

| Method | Path                      | Access | Result                                                                        |
| ------ | ------------------------- | ------ | ----------------------------------------------------------------------------- |
| GET    | `/storefront-theme`       | Public | Resolved theme, greeting, switches, server time and next scheduled transition |
| GET    | `/storefront-theme/admin` | ADMIN  | Selected configuration, version, update time and resolved active appearance   |
| PUT    | `/storefront-theme/admin` | ADMIN  | Replace configuration and return saved settings                               |

Example update (use the latest version from the admin GET):

```json
{
  "theme": "CHRISTMAS",
  "headline": "A little wonder. A lot of joy.",
  "message": "Wishing you a wonderful Christmas from Appliances.lk.",
  "showGreeting": true,
  "decorations": true,
  "animations": true,
  "startsAt": "2026-12-01T00:00:00+05:30",
  "endsAt": "2026-12-27T00:00:00+05:30",
  "version": 0
}
```

The optional `animations` boolean defaults to true for older callers. The frontend respects reduced-motion and data-saving preferences even when enabled; visitors can pause locally. Empty greeting fields use the preset copy. Headline and message are plain text, limited to 80 and 180 characters. Dates must include a timezone; null start means immediately, null end means until changed. The start is inclusive and the end exclusive. An end must be in the future and after the start. Before the window and after it ends, the public API returns Default.

Saving Default clears text and scheduling. The public Default appearance always disables greetings, decorations and animation. Missing configuration resolves to Default. Database outages return a sanitized 503; the frontend handles this optional configuration by showing Default.

Updates lock the row within a transaction and require the current version. A stale editor receives 409 and must reload before saving. Admin authorization is enforced on the backend. Public responses omit editor identity and configuration versions. Only one occasion/window is configured at a time; saving replaces the previous choice.

## Verification

Use a development/test database: these suites temporarily change the shared seasonal setting.

```sh
npm run test:themes
npm run test:themes:integration
```

Integration checks use real HTTP, authentication and PostgreSQL with mocked SMTP. They restore the previous configuration and remove their test accounts. Run theme integration and frontend theme browser tests sequentially because both temporarily update the same singleton setting.
