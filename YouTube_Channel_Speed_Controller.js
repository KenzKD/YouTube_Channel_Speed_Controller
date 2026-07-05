// ============================================================
// Enhancer for YouTube™ — Remember Speed Per Channel (v20)
// Paste this into: EfYT Options → Custom Script
// ============================================================

(function ()
{
	"use strict";

	const SUPPRESS_RESET_MS = 500;
	const RETRY_DELAY_MS    = 1500;
	const MAX_RETRIES       = 3;
	const EFYT_KEY          = "enhancer-for-youtube";
	const CH_PREFIX         = "efyt_ch_speed::";
	const CH_SELECTORS      =
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
	const ARTIST_BADGE_SVG_PATH = "M9.03 2.242 8.272 3H7.2A4.2 4.2 0 003 7.2v1.072l-.758.758a4.2 4.2 0 000 5.94l.758.758V16.8A4.2 4.2 0 007.2 21h1.072l.758.758a4.2 4.2 0 005.94 0l.758-.758H16.8a4.2 4.2 0 004.2-4.2v-1.072l.758-.758a4.2 4.2 0 000-5.94L21 8.272V7.2A4.2 4.2 0 0016.8 3h-1.072l-.758-.758a4.2 4.2 0 00-5.94 0Zm7.73 6.638a.5.5 0 01.241.427v1.743a.256.256 0 01-.386.219L14.001 9.7v4.55a2.75 2.75 0 11-2-2.646V6.888a.5.5 0 01.759-.428l4 2.42Z";
	const TITLE_SELECTORS =
	[
		"ytd-watch-metadata h1.ytd-watch-metadata yt-formatted-string",
		"#title h1 yt-formatted-string",
		"h1.ytd-video-primary-info-renderer",
	];
	const TITLE_KEYWORDS =
	[
		"official audio",
		"official video",
		"official music video",
		"official lyric video",
		"official visualizer",
		"lyric video",
		"lyrics",
		"audio only",
		"visualizer",
	];

	let suppressSave = false;
	let settling     = false;
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

	function hasArtistBadgeSvg()
	{
		const scope = document.querySelector("#owner, ytd-channel-name") ?? document;
		const paths = scope.querySelectorAll("svg path");
		for (const path of paths)
		{
			if (path.getAttribute("d") === ARTIST_BADGE_SVG_PATH) return true;
		}
		return false;
	}

	function getVideoTitle()
	{
		for (const sel of TITLE_SELECTORS)
		{
			const text = document.querySelector(sel)?.textContent?.trim();
			if (text) return text;
		}
		return "";
	}

	function titleMatchesMusicKeyword(title)
	{
		const lower = title.toLowerCase();
		return TITLE_KEYWORDS.some(kw => lower.includes(kw));
	}

	function getVideoCategory()
	{
		return document.querySelector('meta[itemprop="genre"]')?.content ?? "";
	}

	function isOfficialArtistChannel()
	{
		for (const sel of ARTIST_BADGE_SELECTORS)
		{
			if (document.querySelector(sel)) return true;
		}

		return false;
	}

	function isMusicCategory()
	{
		if (getVideoCategory() === "Music") return true;
		if (isOfficialArtistChannel()) return true;
		if (hasArtistBadgeSvg()) return true;

		return titleMatchesMusicKeyword(getVideoTitle());
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
			if (localStorage.getItem(CH_PREFIX + id) !== null)
			{
				localStorage.removeItem(CH_PREFIX + id);
				console.log(`[EfYT-ChSpeed] Cleared override for ${id} (matches default ${def}x)`);
			}
		}
		else
		{
			localStorage.setItem(CH_PREFIX + id, String(speed));
			console.log(`[EfYT-ChSpeed] Saved ${speed}x for ${id}`);
		}
	}

	// -----------------------------------------------------------
	// Generic "retry until condition holds" loop.
	// Used for anything that has to wait on YouTube's SPA DOM to settle.
	// -----------------------------------------------------------

	function retryUntil(check, onFound, retriesLeft, onGiveUp)
	{
		if (check())
		{
			onFound();
			return;
		}

		if (retriesLeft > 0)
		{
			setTimeout(() => retryUntil(check, onFound, retriesLeft - 1, onGiveUp), RETRY_DELAY_MS);
		}
		else
		{
			onGiveUp?.();
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

		if (!v || !plus || !minus)
		{
			console.warn("[EfYT-ChSpeed] stepToSpeed: video or EfYT buttons not found yet.", { v: !!v, plus: !!plus, minus: !!minus });
			return false;
		}

		if (Math.abs(v.playbackRate - target) < 0.001) return true;

		const before = v.playbackRate;
		(target > before ? plus : minus).click();

		// NOTE: assumes EfYT's +/- handlers mutate video.playbackRate synchronously
		// on click. If EfYT ever defers this (rAF, promise, debounce), `step` will
		// read 0 and this function will return false without adjusting speed.
		const step = Math.abs(v.playbackRate - before);
		if (!step) return false;

		const after  = v.playbackRate;
		const clicks = Math.round((target - after) / step);
		const btn    = clicks > 0 ? plus : minus;
		for (let i = 0; i < Math.abs(clicks); i++) btn.click();
		console.log(`[EfYT-ChSpeed] Stepped to ${v.playbackRate}x`);
		return true;
	}

	// -----------------------------------------------------------
	// Main: apply the correct speed once the current video is loaded
	// -----------------------------------------------------------

	function onRateChange()
	{
		if (settling)
		{
			console.log("[EfYT-ChSpeed] Ignoring ratechange while settling.");
			return;
		}

		const id = getChannelId();
		if (!suppressSave && id) saveChannelSpeed(id, video.playbackRate);
	}

	// forceMusicSpeed keeps its own internal retry — that one is for
	// "music was detected but stepToSpeed failed because EfYT's buttons
	// weren't in the DOM yet", which is a different wait than the
	// "music isn't detectable yet at all" wait handled by retryUntil.
	function forceMusicSpeed(retriesLeft = MAX_RETRIES)
	{
		console.log("[EfYT-ChSpeed] Music detected — forcing 1x");
		suppressSave = true;
		const ok = stepToSpeed(1);

		if (!ok && retriesLeft > 0)
		{
			suppressSave = false;
			setTimeout(() => forceMusicSpeed(retriesLeft - 1), RETRY_DELAY_MS);
			return;
		}

		setTimeout(() => { suppressSave = false; }, SUPPRESS_RESET_MS);
	}

	function applySpeedForCurrentVideo()
	{
		// Block onRateChange from mistaking EfYT's own auto-applied default
		// speed for a user action while we're still resolving the channel.
		settling = true;

		// Saved per-channel speed and music detection can each lag behind
		// loadedmetadata independently, so they run as separate retry loops
		// rather than blocking on each other.
		retryUntil(
			() => !!getChannelId(),
			() =>
			{
				const id    = getChannelId();
				const saved = loadChannelSpeed(id);
				if (saved)
				{
					console.log(`[EfYT-ChSpeed] Restoring ${saved}x for ${id}`);
					suppressSave = true;
					if (stepToSpeed(saved)) setTimeout(() => { suppressSave = false; }, SUPPRESS_RESET_MS);
					else suppressSave = false;
				}
				settling = false;
			},
			MAX_RETRIES,
			() => { settling = false; }
		);

		retryUntil(isMusicCategory, () => forceMusicSpeed(), MAX_RETRIES);
	}

	function bindVideo(v)
	{
		if (v === video) return;

		video?.removeEventListener("ratechange", onRateChange);
		v.addEventListener("ratechange", onRateChange);
		video = v;
	}

	function onVideoNavigation()
	{
		const v = document.querySelector("video");
		if (!v) return;

		bindVideo(v);

		// readyState >= 1 (HAVE_METADATA) means loadedmetadata already fired
		if (v.readyState >= 1)
		{
			applySpeedForCurrentVideo();
		}
		else
		{
			v.addEventListener("loadedmetadata", () => applySpeedForCurrentVideo(), { once: true });
		}
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

		hasArtistBadgeSvg: () =>
		{
			const hasSvg = hasArtistBadgeSvg();
			console.log("[EfYT-ChSpeed] Artist badge SVG present:", hasSvg);
			return hasSvg;
		},

		getVideoTitle: () =>
		{
			const title = getVideoTitle();
			console.log("[EfYT-ChSpeed] Video title:", title || "(not found)");
			return title;
		},

		titleMatchesMusicKeyword: (title = getVideoTitle()) =>
		{
			const matches = titleMatchesMusicKeyword(title);
			console.log(`[EfYT-ChSpeed] Title "${title}" matches keyword:`, matches);
			return matches;
		},

		getVideoCategory: () =>
		{
			const category = getVideoCategory();
			console.log("[EfYT-ChSpeed] Video category:", category || "(not found)");
			return category;
		},

		isMusicCategory: () =>
		{
			const isMusic = isMusicCategory();
			console.log("[EfYT-ChSpeed] Is music category:", isMusic);
			return isMusic;
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

			const blob = new Blob([json], { type: "application/json" });
			const url  = URL.createObjectURL(blob);

			const ts       = new Date().toISOString().replace(/[:.]/g, "-");
			const filename = `efyt-channel-speeds_${ts}.json`;

			const a = document.createElement("a");
			a.href     = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			a.remove();

			URL.revokeObjectURL(url);

			console.log(`[EfYT-ChSpeed] Exported ${Object.keys(out).length} channel(s) to ${filename}`);
			return out;
		},

		import: () =>
		{
			const OVERLAY_ID = "efyt-chspeed-import-btn";
			const OVERLAY_STYLE =
			{
				position: "fixed",
				top: "16px",
				right: "16px",
				zIndex: "999999",
				padding: "40px 56px",
				background: "#065fd4",
				color: "#fff",
				border: "none",
				borderRadius: "24px",
				fontSize: "52px",
				fontFamily: "sans-serif",
				cursor: "pointer",
				boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
			};

			if (document.getElementById(OVERLAY_ID))
			{
				console.log("[EfYT-ChSpeed] Import button is already showing — click it in the top-right corner.");
				return;
			}

			function isJsonFile(file)
			{
				return file.type === "application/json" || file.name.toLowerCase().endsWith(".json");
			}

			function applyImportedData(json)
			{
				let parsed;
				try
				{
					parsed = JSON.parse(json);
				}
				catch (_)
				{
					console.error("[EfYT-ChSpeed] Import failed — file is not valid JSON.");
					return;
				}

				let count = 0;
				for (const [id, sp] of Object.entries(parsed))
				{
					const n = parseFloat(sp);
					if (isNaN(n) || n <= 0) continue;
					localStorage.setItem(CH_PREFIX + id, String(n));
					count++;
				}
				console.log(`[EfYT-ChSpeed] Imported ${count} channel(s).`);
			}

			function showImportButton()
			{
				const overlay = document.createElement("button");
				overlay.id = OVERLAY_ID;
				overlay.textContent = "📂 Click to choose EfYT speeds JSON";
				Object.assign(overlay.style, OVERLAY_STYLE);

				const input = document.createElement("input");
				input.type = "file";
				input.accept = ".json,application/json";
				input.style.display = "none";

				const overlayController = new AbortController();
				const inputController   = new AbortController();

				setTimeout(() =>
				{
					if (inputController.signal.aborted) return;
					overlayController.abort();
					inputController.abort();
					overlay.remove();
					input.remove();
					console.log("[EfYT-ChSpeed] Import cancelled — button timed out.");
				}, 8000);

				input.addEventListener("change", () =>
				{
					inputController.abort();
					input.remove();

					const file = input.files?.[0];
					if (!file) return;

					if (!isJsonFile(file))
					{
						console.error(`[EfYT-ChSpeed] Import failed — "${file.name}" is not a .json file.`);
						return;
					}

					const reader   = new FileReader();
					reader.onload  = () => applyImportedData(reader.result);
					reader.onerror = () => console.error("[EfYT-ChSpeed] Import failed — could not read file.");
					reader.readAsText(file);
				}, { signal: inputController.signal });

				overlay.addEventListener("click", () =>
				{
					overlayController.abort();
					overlay.remove();
					input.click();
				}, { signal: overlayController.signal });

				document.body.appendChild(overlay);
				document.body.appendChild(input);

				console.log("[EfYT-ChSpeed] Click the blue button in the top-right corner to choose a file.");
			}

			showImportButton();
		},

		help: () =>
		{
			console.log(
				`%c[EfYT-ChSpeed] Commands:

%cDetection
%c  efytSpeed.isMusicCategory()              → true if any detection layer matches
  efytSpeed.getVideoCategory()             → reads meta[itemprop="genre"]
  efytSpeed.isOfficialArtistChannel()      → checks badge selectors only
  efytSpeed.hasArtistBadgeSvg()            → checks badge SVG icon
  efytSpeed.getVideoTitle()                → current video title
  efytSpeed.titleMatchesMusicKeyword([t])  → test a title against keywords

%cChannel speed
%c  efytSpeed.getChannelId()                 → current channel path
  efytSpeed.getDefaultSpeed()              → EfYT's global default speed
  efytSpeed.getSpeed([id])                 → saved speed for a channel
  efytSpeed.setSpeed(n [,id])              → set + save speed for a channel
  efytSpeed.clearSpeed([id])               → remove override for a channel
  efytSpeed.clearAll()                     → remove all saved overrides

%cData
%c  efytSpeed.export()                       → log all overrides as JSON
  efytSpeed.import()                       → show a button to pick a .json file to import

%cMisc
%c  efytSpeed.refresh()                      → manually re-run detection now`,
				"color:#fff;font-weight:bold",
				"color:#8ab4f8;font-weight:bold",
				"color:#ccc",
				"color:#8ab4f8;font-weight:bold",
				"color:#ccc",
				"color:#8ab4f8;font-weight:bold",
				"color:#ccc",
				"color:#8ab4f8;font-weight:bold",
				"color:#ccc"
			);
		},
	};

	console.log("%c[EfYT-ChSpeed] Active. %cType efytSpeed.help() for commands.", "color:#fff;font-weight:bold", "color:#aaa");
})();