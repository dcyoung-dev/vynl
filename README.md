# Vynl

Spotify albums, played like records. Vynl is a static Astro + React + Tailwind site that signs in to Spotify in the browser, plays whole albums through the Web Playback SDK, and shows a turntable spinning the record.

It runs entirely in the browser. Anything it remembers lives in `localStorage`. It is hosted on GitHub Pages at https://dcyoung-dev.github.io/vynl/.

The plan lives in [`docs/plans/`](docs/plans/).

## One-time setup

Do these once before the first deploy.

### Spotify app

1. Sign in to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and choose **Create app**.
2. Tick **Web API** and **Web Playback SDK** as the APIs used.
3. Register both redirect URIs exactly as written, including the trailing slash:
   - `https://dcyoung-dev.github.io/vynl/callback/`
   - `http://127.0.0.1:4321/vynl/callback/`
4. Save, then copy the app's **Client ID**. It is public, so no client secret is needed.
5. Under **User Management**, add each listener's name and Spotify account email. The app stays in development mode, which allows up to five users, and playback needs Spotify Premium.

### GitHub repository

1. In **Settings → Pages**, set **Source** to **GitHub Actions**.
2. In **Settings → Secrets and variables → Actions → Variables**, add a repository variable named `PUBLIC_SPOTIFY_CLIENT_ID` with the Client ID.

Every push to `main` then runs the "Deploy to GitHub Pages" workflow (`.github/workflows/deploy.yml`) and publishes the site to https://dcyoung-dev.github.io/vynl/. You can also run it by hand from the **Actions** tab.

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
| `bun run dev:demo` | Start a signed-in demo with fake albums, queue, devices and playback at `http://127.0.0.1:4322/vynl/`, no Spotify account needed |
| `bun run test` | Run the Vitest suite (never `bun test`, which skips Astro's Vite pipeline) |
| `bun run check` | Type-check and run Astro diagnostics |
| `bun run build` | Build the static site to `./dist/` |
| `bun run preview` | Serve the built site, with the content security policy active |

## Demo mode

`bun run dev:demo` runs the real app against an in-browser fake of Spotify, so you can try the player and check layouts without an account. It uses its own origin (port 4322), so its sign-in and saved queue live in that origin's storage and never touch a real session on port 4321. The fake is dev-only: it is gated on `import.meta.env.DEV`, so production builds never include it.

## Shared album playlists

`/playlists/` lists curated album selections, and each has a stable public page such as `/playlists/album-rotation/`. The pages are static HTML. Anyone can open them without signing in, and sharing one means sharing its address.

A playlist is an ordered list of albums. **Play in Vynl** opens the player with that selection chosen. Nothing plays until the listener presses **Start playlist**, after signing in with their own Spotify account if needed. Starting loads every album first, then replaces the current record and the whole queue, and plays the first album from the beginning. If something is on the turntable or in the queue, Vynl asks before replacing it. If any album fails to load, nothing changes and the error offers a retry. Reloading or revisiting never starts or re-imports a playlist.

Browsing is public, but playback is not. Playing still needs Spotify Premium, and while the Spotify app is in development mode only the five allowlisted users can use the API. Anyone else can open the pages and sign in, but playback fails. Navigating from a playlist page to the player reloads the site, so audio that is already playing stops.

To add a playlist, add an entry to `playlists` in `src/lib/playlists/catalog.ts` with a URL-safe `slug`, a title, a description and its albums. Each album needs its Spotify ID, name, artists and artwork URL. The index and the page are built from the data, so no route file is needed. Keep a published slug stable, because it is part of shared links. Redeploy to publish.

## Palette

The palette is defined as Tailwind theme colours in OKLCH in `src/styles/global.css`. Use the classes, such as `bg-dark-slate`, `text-vanilla-custard`, `bg-honey-bronze`, `border-muted-teal` and `bg-night-bordeaux`, not hex values or custom CSS.
