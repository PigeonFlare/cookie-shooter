# Site Attack

Turn any web page against you. Site Attack is a browser extension that lifts a page's own buttons, links, images and boxes off the page and sends them after you. You fly the mouse cursor, and you win by taking apart every element on the page.

**Play the cookie version in your browser:** https://pigeonflare.github.io/site-attack/

## Install the extension

1. Download this repo (Code > Download ZIP) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the `extension` folder.

Then open any page, click the Site Attack cursor icon in the toolbar, pick a difficulty and press **Start attack**. Open the popup again at any time and press **End attack** to put the page back exactly how it was.

Browsers don't let extensions run on their own pages (`chrome://`, `about:`), add-on stores or the built-in PDF viewer, so those can't be attacked. Pages drawn entirely on a canvas have no elements to grab, so you get cookie waves there instead.

## How to play

| Control | Action |
| --- | --- |
| WASD / arrow keys | Fly |
| Mouse | Aim |
| Click / Space | Use your current attack |
| 1 / 2 / 3 | Switch to swing, shoot or dash (or tap the buttons) |
| Esc | Pause |

Swing hits everything in an arc in front of you and cuts through enemy bullets. Shoot fires blue bolts. Dash is a quick invulnerable burst toward your cursor that damages everything you pass through.

There's no health bar. Your cursor glows so you can spot it in a crowd, and it gets more chipped and cracked as your health drops to 75%, 50% and 25%.

On a phone, touch and drag to fly. Swing and shoot auto-target the nearest enemy, and with dash selected each new tap dashes toward your finger.

## Page attack

After a three-second countdown, the page's smaller elements come to life:

- **Difficulty:** Easy brings up to 10 elements and Medium (the default) up to 30. Hard throws in every element on screen, up to what your device can run smoothly.
- **Melee:** about one in ten elements, and at least two, rush straight at you.
- **Shooters:** the rest spread out across your half of the screen and shoot. Each has one attack: a fast burst of three, a single heavy shot, or a laser with a warning line. A shooter flashes a tint just before it fires, and every so often one dives straight at you. Shooters take turns firing, so busy pages stay beatable without anyone going quiet.
- **Boss:** the biggest element on the page is always a boss, with one of three attacks: bullets in six directions, lasers in four directions, or straight bursts aimed where you're about to be.
- **Aim:** every enemy moves slower than you. Some aim straight at you and others aim where you're about to be.

Destroyed elements sometimes drop a power-up: a heart for health, a lightning bolt for speed or a sword for damage. Clear every element to conquer the site. The popup counts the sites you've conquered and expands into a list showing the hardest difficulty you beat each one on.

The extension also has the original endless cookie waves under **Play cookie waves instead**.

## The cookie version

The website plays the cookie waves inside a 2009-era copy of Chrome opened to google.com. Every cookie a page tries to load is an enemy:

- **Necessary cookies** (green rings) are the ones the site needs, like `SID`. Hitting them hurts you too, and deleting one costs points.
- **Trackers** like `_ga` or `_hjSessionUser` rush you.
- **Ad networks** like `IDE doubleclick.net` keep their distance and shoot bursts, heavy shots or lasers.
- Every fifth wave a **supercookie** shows up and orbits, charges and teleports around the page.

The Google logo letters, search box, buttons and links are solid walls that block you, the cookies and every bullet. Each one shatters after five bullet hits and rebuilds when the wave ends. Press Enter to start the next wave, and click the extension icon next to the address bar to save, load or start over.

## Privacy and safety

The extension runs entirely on your computer. It makes no network requests and has no analytics, and its only stored data is your conquered sites, difficulty and sound setting. You can wipe the list from the popup. It asks for three permissions:

- `activeTab` and `scripting` let it run on the tab you clicked it on, and only when you press a start button. It can't read or touch any other tab or run in the background.
- `storage` saves your conquered sites and settings.

The game draws in a sealed overlay that the page's own scripts can't reach. It never reads cookies, form contents or anything you've typed. It hides page elements only while you play and puts them back when you press **End attack**.

## Running the website locally

It's a static site with no build step. Open `index.html`, or serve the folder:

```sh
python3 -m http.server
```
