// ============================================================
// Enhancer for YouTube™ — Remember Speed Per Channel (v15)
// Paste this into: EfYT Options → Custom Script
// ============================================================

(function ()
{
	"use strict";

	const APPLY_DELAY_MS = 1500;
	const EFYT_KEY       = "enhancer-for-youtube";
	const CH_PREFIX      = "efyt_ch_speed::";
	const CH_SELECTORS   =
	[
		"ytd-channel-name a",
		"#channel-name a",
		"yt-formatted-string#channel-name a",
		"#owner a.yt-simple-endpoint[href*='/@']",
		"a.yt-simple-endpoint[href*='/@']",
	];
	const ARTIST_BADGE_SELECTORS =
	[
		'badge-shape[aria-label="Official Artist Channel"]',
		'[aria-label="Official Artist Channel"]',
	];

	let suppressSave = false;
	let video        = null;

	// -----------------------------------------------------------
	// Helpers
	// -----------------------------------------------------------

	function getEfytDefaultSpeed()
	{
		try   { return JSON.parse(localStorage.getItem(EFYT_KEY))?.speed || 1; }
		catch { return 1; }
	}

	function getChannelId()
	{
		for (const sel of CH_SELECTORS)
		{
			try
			{
				const path = new URL(document.querySelector(sel)?.href ?? "").pathname.toLowerCase();
				if (path.startsWith("/@") || path.startsWith("/channel/")) return path;
			}
			catch (_) {}
		}
		return null;
	}

	function isOfficialArtistChannel()
	{
		for (const sel of ARTIST_BADGE_SELECTORS)
		{
			if (document.querySelector(sel)) return true;
		}
		return false;
	}

	function loadChannelSpeed(id)
	{
		const n = parseFloat(localStorage.getItem(CH_PREFIX + id));
		return n > 0 ? n : null;
	}

	function saveChannelSpeed(id, speed)
	{
		const def = getEfytDefaultSpeed();
		if (Math.abs(speed - def) < 0.001)
		{
			localStorage.removeItem(CH_PREFIX + id);
			console.log(`[EfYT-ChSpeed] Cleared override for ${id} (matches default ${def}x)`);
		}
		else
		{
			localStorage.setItem(CH_PREFIX + id, String(speed));
			console.log(`[EfYT-ChSpeed] Saved ${speed}x for ${id}`);
		}
	}

	// -----------------------------------------------------------
	// Step EfYT to target speed using its own +/- buttons
	// -----------------------------------------------------------

	function stepToSpeed(target)
	{
		const v     = document.querySelector("video");
		const plus  = document.getElementById("efyt-speed-plus");
		const minus = document.getElementById("efyt-speed-minus");
		if (!v || !plus || !minus || Math.abs(v.playbackRate - target) < 0.001) return;

		const before = v.playbackRate;
		(target > before ? plus : minus).click();

		const step = Math.abs(v.playbackRate - before);
		if (!step) return;

		const after  = v.playbackRate;
		const clicks = Math.round((target - after) / step);
		const btn    = clicks > 0 ? plus : minus;
		for (let i = 0; i < Math.abs(clicks); i++) btn.click();
		console.log(`[EfYT-ChSpeed] Stepped to ${v.playbackRate}x`);
	}

	// -----------------------------------------------------------
	// Main: run on every YouTube navigation
	// -----------------------------------------------------------

	function onRateChange()
	{
		if (!suppressSave) saveChannelSpeed(getChannelId(), video.playbackRate);
	}

	function onVideoNavigation()
	{
		setTimeout(() =>
		{
			const v = document.querySelector("video");
			if (!v) return;

			if (v !== video)
			{
				video?.removeEventListener("ratechange", onRateChange);
				v.addEventListener("ratechange", onRateChange);
				video = v;
			}

			const id = getChannelId();

			// Official Artist Channels always get forced to 1x, ignoring any saved override
			if (isOfficialArtistChannel())
			{
				console.log(`[EfYT-ChSpeed] Official Artist Channel detected for ${id ?? "(unknown)"} — forcing 1x`);
				suppressSave = true;
				stepToSpeed(1);
				setTimeout(() => { suppressSave = false; }, 500);
				return;
			}

			const saved = id && loadChannelSpeed(id);
			if (!saved) return;

			console.log(`[EfYT-ChSpeed] Restoring ${saved}x for ${id}`);
			suppressSave = true;
			stepToSpeed(saved);
			setTimeout(() => { suppressSave = false; }, 500);
		}, APPLY_DELAY_MS);
	}

	window.addEventListener("yt-navigate-finish", onVideoNavigation);

	// -----------------------------------------------------------
	// Public API — all internals exposed on window.efytSpeed
	// -----------------------------------------------------------

	// Returns all localStorage keys belonging to this script
	const chKeys = () => Object.keys(localStorage).filter(k => k.startsWith(CH_PREFIX));

	window.efytSpeed =
	{
		refresh: () =>
		{
			console.log("[EfYT-ChSpeed] Manual refresh.");
			onVideoNavigation();
		},

		getChannelId: () =>
		{
			const id = getChannelId();
			console.log("[EfYT-ChSpeed] Channel ID:", id ?? "(not found)");
			return id;
		},

		isOfficialArtistChannel: () =>
		{
			const isArtist = isOfficialArtistChannel();
			console.log("[EfYT-ChSpeed] Official Artist Channel:", isArtist);
			return isArtist;
		},

		getDefaultSpeed: () =>
		{
			const s = getEfytDefaultSpeed();
			console.log("[EfYT-ChSpeed] Default:", s + "x");
			return s;
		},

		getSpeed: (id = getChannelId()) =>
		{
			const s = id && loadChannelSpeed(id);
			console.log(`[EfYT-ChSpeed] Speed for ${id}:`, s ? s + "x" : "(none)");
			return s;
		},

		setSpeed: (speed, id = getChannelId()) =>
		{
			if (!id) { console.warn("[EfYT-ChSpeed] No channel detected."); return; }
			saveChannelSpeed(id, speed);
			stepToSpeed(speed);
		},

		clearSpeed: (id = getChannelId()) =>
		{
			if (!id) { console.warn("[EfYT-ChSpeed] No channel detected."); return; }
			localStorage.removeItem(CH_PREFIX + id);
			console.log(`[EfYT-ChSpeed] Cleared speed for ${id}.`);
		},
		clearAll: () =>
		{
			const keys = chKeys();
			keys.forEach(k => localStorage.removeItem(k));
			console.log(`[EfYT-ChSpeed] Cleared ${keys.length} override(s).`);
		},

		export: () =>
		{
			const out  = Object.fromEntries(chKeys().map(k => [k.slice(CH_PREFIX.length), parseFloat(localStorage.getItem(k))]));
			const json = JSON.stringify(out, null, 2);
			console.log("%c[EfYT-ChSpeed] Copy the JSON below:", "color:#aaa;font-style:italic");
			console.log("%c----------------------------------------", "color:#444");
			console.log(json);
			console.log("%c----------------------------------------", "color:#444");
			return out;
		},

		import: (data) =>
		{
			if (typeof data === "string")
			{
				try   { data = JSON.parse(data); }
				catch (_) { console.error("[EfYT-ChSpeed] Import failed — invalid JSON."); return; }
			}
			let count = 0;
			for (const [id, sp] of Object.entries(data))
			{
				const n = parseFloat(sp);
				if (isNaN(n) || n <= 0) continue;
				localStorage.setItem(CH_PREFIX + id, String(n));
				count++;
			}
			console.log(`[EfYT-ChSpeed] Imported ${count} channel(s).`);
		},

		help: () => console.log(
			`%c[EfYT-ChSpeed] Commands:
  efytSpeed.refresh()
  efytSpeed.getChannelId()
  efytSpeed.isOfficialArtistChannel()
  efytSpeed.getDefaultSpeed()
  efytSpeed.getSpeed([id])
  efytSpeed.setSpeed(n [,id])
  efytSpeed.clearSpeed([id])
  efytSpeed.clearAll()
  efytSpeed.export()
  efytSpeed.import(obj|json)`,
			"color:#fff;font-weight:bold"
		),
	};

	console.log("%c[EfYT-ChSpeed] Active. %cType efytSpeed.help() for commands.", "color:#fff;font-weight:bold", "color:#aaa");
})();