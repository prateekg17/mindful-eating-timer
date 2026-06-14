# Mindful Eating Timer

A lightweight, zero-dependency browser app that helps you eat more slowly and
mindfully. It counts down from 55 minutes and plays a gentle chime at every
passing minute so you can stay present without watching the clock.

---

## Features

- 55-minute countdown with minutes and seconds displayed
- Chime at every minute boundary, with a richer completion chord at 0:00
- Start, Pause/Resume, and Reset controls
- Progress bar showing elapsed time
- Sound toggle to enable or disable the minute chime at any time
- Background audio support - chimes fire via the Web Audio rendering thread,
  so they play even when you switch to another app (screen on, not silent)
- Near-silent keep-alive loop holds the iOS audio session open when Safari is
  backgrounded, preventing the AudioContext from being suspended
- Healthy-eating lifestyle theme with earthy greens, soft shadows, and
  floating leaf decorations
- Fully responsive - works on desktop, tablet, and mobile
- Accessible markup - native `<progress>` element, `role="timer"`,
  `aria-live="polite"`, labelled controls

---

## Project structure

```text
mindful-eating-timer/
  static/                  <- deployable site (uploaded to GitHub Pages as-is)
    index.html
    style.css
    script.js
  .github/
    workflows/
      deploy.yml           <- GitHub Actions workflow for GitHub Pages
  .gitignore
  README.md
```

No build step, no package manager, no dependencies. Every file is plain
HTML, CSS, and vanilla JavaScript.

---

## Running locally

Because the app is plain static HTML you can open it directly in a browser
without a server. However, some browsers restrict the Web Audio API on
`file://` URLs, so a local server gives the most accurate experience.

### Option 1 - Python (built in to macOS)

```sh
cd /path/to/mindful-eating-timer
python3 -m http.server 8080 --directory static
```

Then open `http://localhost:8080` in your browser.

### Option 2 - Node.js `npx serve`

```sh
npx serve static
```

Then open the URL printed in the terminal (usually `http://localhost:3000`).

### Option 3 - Open the file directly

```sh
open static/index.html
```

This works for basic testing. If the chime does not play, use one of the
server options above.

---

## Deployment - GitHub Pages

The workflow at `.github/workflows/deploy.yml` publishes the `static/` folder
to GitHub Pages automatically on every push to `main`.

**One-time setup:**

1. Push the repository to GitHub.
2. Go to **Settings → Pages** in the repository.
3. Under **Source**, select **GitHub Actions**.

After that, every push to `main` triggers the workflow and the live site
updates at:

```text
https://prateekg17.github.io/mindful-eating-timer/
```

---

## Browser compatibility

| Browser                    | Audio | Background audio (screen on, not silent)               | Display on return               |
|----------------------------|-------|--------------------------------------------------------|---------------------------------|
| Chrome (desktop + Android) | Yes   | Yes                                                    | Snaps to correct time instantly |
| Safari (macOS + iOS)       | Yes   | Yes - keep-alive loop prevents AudioContext suspension | Snaps to correct time instantly |
| Firefox                    | Yes   | Partial - depends on OS audio policy                   | Snaps to correct time instantly |

> **Note** - on iOS, the silent switch mutes all browser audio regardless of
> volume settings. This is an OS-level restriction that cannot be overridden
> from a web page. Chimes also require the screen to be on; a locked screen
> may cause iOS to suspend the browser tab entirely.

---

## Licence

[MIT](LICENSE)
