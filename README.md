# YouTube Channel Speed Controller

Automatically saves and restores your preferred playback speed on a per-channel basis when using the [Enhancer for YouTube™](https://www.mrfdev.com/enhancer-for-youtube) (EfYT) browser extension.

> [!CAUTION]
> Vibe-coded at 2am with Claude Sonnet 4.6. It works for me. No promises it works for you. Read the code first.

---

## How It Works

- When you change the playback speed on a channel using EfYT's speed buttons or scrolling over the speed icon, that speed is saved automatically.
- The next time you visit a video from that channel, the saved speed is restored using EfYT's own `+` / `−` buttons — keeping EfYT's internal state fully in sync.
- If you set the speed back to your EfYT global default (I keep mine at 2x Speed), the channel override is deleted automatically.
- The speed button tooltip updates on hover to reflect the actual current speed.

---

## Installation

1. Install the [Enhancer for YouTube™](https://www.mrfdev.com/enhancer-for-youtube) extension for Chrome, Edge, or Firefox.
2. Open the EfYT options page by clicking the extension icon in your browser toolbar.
3. Scroll down to the **Custom Script** section.
4. Copy the entire contents of `YouTube_Channel_Speed_Controller.js` and paste it into the Custom Script text area.
5. Click **Save**.
6. Tick mark the box next to "Automatically execute the script when YouTube is loaded in a tab"
7. Reload any open YouTube tabs.

> **Note:** The script takes effect immediately on the next page navigation. You should see `[EfYT-ChSpeed] Active.` printed in the browser console (F12 → Console) confirming it is running.

---

## Usage

Simply browse YouTube as normal. Whenever you adjust the speed using EfYT's `+` or `−` buttons or scroll up or down on the speed icon, the speed for that channel is saved automatically. When you navigate to another video on the same channel, the speed will be restored.

No configuration is required.

---

## Backup & Restore

All saved channel speeds are stored in your browser's `localStorage`. You can export and import them from the **DevTools Console** on any YouTube page.

### Opening the Console

Press `F12` (or `Ctrl+Shift+I` on Windows/Linux, `Cmd+Option+I` on Mac) to open DevTools, then click the **Console** tab.

---

### Export

Run the following in the Console:

```javascript
efytSpeedExport();
```

Your saved channels and speeds will be printed as a JSON block. Copy everything between the dashed lines, for example:

```json
{
	"/@mkbhd": 1.5,
	"/@veritasium": 2,
	"/@linustechtips": 1.75
}
```

Save this JSON to a text file in a safe location.

---

### Import

Run the following in the Console, replacing the example data with your own backup:

```javascript
efytSpeedImport({
	"/@mkbhd": 1.5,
	"/@veritasium": 2,
	"/@linustechtips": 1.75,
});
```

Or if you have your backup saved as a JSON string:

```javascript
efytSpeedImport('{"/@mkbhd": 1.5, "/@veritasium": 2}');
```

The console will confirm how many channels were imported:

```
[EfYT-ChSpeed] Imported 3 channel(s).
```

> **Note:** Importing will overwrite any existing saved speed for channels included in the backup. Channels not present in the backup are left untouched.

---

## Notes

- Speeds are stored per browser profile. If you use multiple browsers or profiles, you will need to export and import separately for each one.
- The script does not modify EfYT's global default speed setting — it only overrides the speed for specific channels.
- If EfYT is updated and the button IDs (`efyt-speed`, `efyt-speed-plus`, `efyt-speed-minus`) or tooltip class (`ytp-efyt-tooltip`) change, the script may need to be updated to match.

---
