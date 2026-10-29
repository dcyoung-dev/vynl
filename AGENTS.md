## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Vynl conventions

- Always open the app at `http://127.0.0.1:4321/vynl/`, never `localhost`. Spotify rejects `localhost`, and `localStorage` is per origin.
- Run tests with `bun run test` (Vitest). Never use `bun test`.
- Build internal links and the Spotify redirect URI with `src/lib/url.ts`. Never hard-code `/vynl`.
- Colours come only from the palette classes in `src/styles/global.css` (`dark-slate`, `honey-bronze`, `muted-teal`, `vanilla-custard`, `night-bordeaux`) and Tailwind neutrals. No hex values or inline `style` attributes.
