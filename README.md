# Vynl

Spotify albums, played like records. Vynl is a static Astro + React + Tailwind site that signs in to Spotify in the browser, plays whole albums through the Web Playback SDK, and shows a turntable spinning the record.

It runs entirely in the browser. Anything it remembers lives in `localStorage`. It is hosted on GitHub Pages at https://dcyoung-dev.github.io/vynl/.

The plan lives in [`docs/plans/`](docs/plans/).

## Local development

Always open **http://127.0.0.1:4321/vynl/**, never `localhost`. Spotify rejects `localhost` redirect URIs, and `localStorage` is separate per origin.

```sh
bun install
cp .env.example .env   # then set PUBLIC_SPOTIFY_CLIENT_ID
bun run dev
```

| Command | Action |
| :-- | :-- |
| `bun run dev` | Start the dev server at `http://127.0.0.1:4321/vynl/` |
| `bun run test` | Run the Vitest suite (never `bun test`, which skips Astro's Vite pipeline) |
| `bun run check` | Type-check and run Astro diagnostics |
| `bun run build` | Build the static site to `./dist/` |
| `bun run preview` | Serve the built site, with the content security policy active |

## Palette

The palette is defined as Tailwind theme colours in OKLCH in `src/styles/global.css`. Use the classes, such as `bg-dark-slate`, `text-vanilla-custard`, `bg-honey-bronze`, `border-muted-teal` and `bg-night-bordeaux`, not hex values or custom CSS.
