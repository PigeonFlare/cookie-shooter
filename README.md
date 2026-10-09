# Cookie Banner

Every cookie a page tries to load is an enemy. You are the mouse cursor, flying around a 2009-era copy of Chrome opened to google.com, and your job is to delete the trackers before they delete you.

**Play:** https://pigeonflare.github.io/cookie-shooter/

## How to play

| Control | Action |
| --- | --- |
| WASD / arrow keys | Fly |
| Mouse | Aim |
| Click / Space | Use your current attack |
| 1 / 2 / 3 | Switch to swing, shoot or dash (or tap the buttons) |
| Enter | Start the next wave |
| Esc | Open the extension menu (pauses) |

Swing hits everything in an arc in front of you and cuts through enemy bullets. Shoot fires big blue bolts. Dash is a quick invulnerable burst in the direction your cursor is pointing that damages every cookie you pass through (necessary ones included, so watch out), with a short cooldown.

On a phone, touch and drag to fly. Swing and shoot auto-target the nearest tracker; with dash selected, each new tap dashes toward your finger.

## The cookies

- **Necessary cookies** (green tags) are the ones the site actually needs, like `ACCOUNT_CHOOSER` and `SID`, which remember which Google account you're signed into. Shooting them hurts both of you, and deleting one breaks the site and costs points.
- **Trackers** (red tags) are the analytics, session-recording and A/B-testing cookies you never asked for, like `_ga`, `_hjSessionUser` or `optimizelyEndUserId`. They're a little faster than you and rush you.
- **Ad networks** (purple tags, like `IDE doubleclick.net` or `uuid2 adnxs.com`) orbit, hop and drift around you while firing spreads, rings, bursts, wavy shots, spirals and lasers. Every enemy bullet is faster than you and aims where you're heading, not where you are. Lasers fire in mirrored pairs and flash a warning line for two seconds first. Every hit costs you between 12 and 25 health.
- Every fifth wave a **supercookie** shows up (evercookie, zombie cookies, Flash LSOs...). It cycles through orbiting, telegraphed charges, spiral barrages, laser grids, teleports and respawning deleted cookies.

Waves grow in size, speed and damage. Deleted trackers sometimes drop a power-up: a heart for health, a lightning bolt for speed or a sword for damage. Each power-up of the same kind is worth a bit less than the last, so stacking one stat has diminishing returns.

## The extension menu

Click the cookie icon next to the address bar to open Cookie Crusher. From there you can start the next wave, save your progress (kept in your browser's local storage, so it survives a reload), load your save, or "clear browsing data" to start over.

## Running locally

It's a static site with no build step. Open `index.html`, or serve the folder:

```sh
python3 -m http.server
```
