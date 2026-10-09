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

Swing hits everything in an arc in front of you and cuts through enemy bullets. Shoot fires big blue bolts. Dash is a quick invulnerable burst with a short cooldown.

On a phone, touch and drag to fly. Swing and shoot auto-target the nearest tracker; with dash selected, each new tap dashes toward your finger.

## The cookies

- **Necessary cookies** (green tags, like `SOCS` or `PHPSESSID`) keep the site working. Shooting them hurts both of you, and deleting one breaks the site and costs points.
- **Trackers** (red tags, like `_ga` or `__utma`) rush you and bite.
- **Ad networks** (purple tags, like `IDE doubleclick.net` or `uuid2 adnxs.com`) orbit, hop and drift around you while firing spreads, rings, bursts, wavy shots and spirals.
- Every fifth wave a **supercookie** shows up (evercookie, zombie cookies, Flash LSOs...). It cycles through orbiting, telegraphed charges, spiral barrages, teleports and respawning deleted cookies.

Waves grow in size, speed and damage. Deleted trackers sometimes drop a power-up: a heart for health, a lightning bolt for speed or a sword for damage. Each power-up of the same kind is worth a bit less than the last, so stacking one stat has diminishing returns.

## The extension menu

Click the cookie icon next to the address bar to open Cookie Crusher. From there you can start the next wave, save your progress (kept in your browser's local storage, so it survives a reload), load your save, or "clear browsing data" to start over.

## Running locally

It's a static site with no build step. Open `index.html`, or serve the folder:

```sh
python3 -m http.server
```
