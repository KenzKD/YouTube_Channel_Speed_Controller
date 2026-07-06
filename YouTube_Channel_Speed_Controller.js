// ============================================================
// Enhancer for YouTube™ — Remember Speed Per Channel (v34)
// Paste this into: EfYT Options → Custom Script
// ============================================================

(function ()
{
	"use strict";

	// Prevent duplicate instances if the script is injected multiple times
	if (window.efytSpeedInitialized) return;
	window.efytSpeedInitialized = true;

	const SUPPRESS_RESET_MS = 500;
	const MIX_CHECK_TIMEOUT_MS = 4000;
	const EFYT_KEY = "enhancer-for-youtube";
	const PLAYER_PARAMS_MUSIC_PREFIX = "8AUB";
	const CH_PREFIX         = "efyt_ch_speed::";
	
	const ARTIST_BADGE_SVG_PATH = "M9.03 2.242 8.272 3H7.2A4.2 4.2 0 003 7.2v1.072l-.758.758a4.2 4.2 0 000 5.94l.758.758V16.8A4.2 4.2 0 007.2 21h1.072l.758.758a4.2 4.2 0 005.94 0l.758-.758H16.8a4.2 4.2 0 004.2-4.2v-1.072l.758-.758a4.2 4.2 0 000-5.94L21 8.272V7.2A4.2 4.2 0 0016.8 3h-1.072l-.758-.758a4.2 4.2 0 00-5.94 0Zm7.73 6.638a.5.5 0 01.241.427v1.743a.256.256 0 01-.386.219L14.001 9.7v4.55a2.75 2.75 0 11-2-2.646V6.888a.5.5 0 01.759-.428l4 2.42Z";

	const BADGE_SELECTOR_COMBINED = 'badge-shape[aria-label="Official Artist Channel"], [aria-label="Official Artist Channel"]';
	const TITLE_SELECTOR_COMBINED = "ytd-watch-metadata h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, h1.ytd-video-primary-info-renderer";

	const TITLE_KEYWORDS =
	[
		"official audio", "official video", "music video", "mv", "official lyric video", 
		"official visualizer", "lyric video", "lyrics", "audio only", "visualizer",
		"dance video", "dance cover", "dance practice", "choreography", "choreo",
		"acoustic cover", "remix", "mashup", "type beat",
		"dj set", "live set", "live session", "live performance",
		"karaoke", "instrumental", "backing track",
		"lofi", "lo-fi", "study music", "workout mix", "gym mix", "chill mix",
		"sped up", "slowed", "nightcore", "8d audio",
		"full album", "album stream", "sfx", "sound effect",
	];

	// Compile keywords into a single case-insensitive RegExp
	const TITLE_KEYWORDS_REGEX = new RegExp(
		TITLE_KEYWORDS.map(kw => {
			const escaped = kw.replace(/[\/\\^$*+?.()|[\]{}]/g, "\\$&").replace(/\s+/g, "\\s+");
			return (kw === "mv" || kw === "sfx") ? `\\b${escaped}\\b` : escaped;
		}).join("|"),
		"i"
	);

	// State Tracking
	let suppressSave       = false;
	let suppressTimeoutId  = null;
	let lastChannelId      = null;
	let lastChannelName    = null;
	let activeVideoId      = null;
	let speedApplied       = false;
	let musicChecked       = false;
	let retryTimeoutId     = null;
	let cutoffTimeoutId    = null;
	let mixAbortController = null;

	// -----------------------------------------------------------
	// Helpers
	// -----------------------------------------------------------

	function getEfytDefaultSpeed()
	{
		try
		{
			const speed = JSON.parse(localStorage.getItem(EFYT_KEY))?.speed;
			return speed > 0 ? speed : 1;
		}
		catch
		{
			return 1;
		}
	}

	function getWatchVideoId()
	{
		const match = location.search.match(/[?&]v=([^&#]+)/);
		return (match ? match[1] : null)
			?? document.querySelector("ytd-watch-flexy")?.getAttribute("video-id")
			?? document.getElementById("movie_player")?.getPlayerResponse?.()?.videoDetails?.videoId;
	}

	function getChannelId(pr)
	{
		return pr?.videoDetails?.channelId;
	}

	function getChannelName(pr)
	{
		return pr?.videoDetails?.author 
			?? document.querySelector("ytd-channel-name yt-formatted-string, #owner ytd-channel-name a")?.textContent?.trim() 
			?? "Unknown Channel";
	}

	function hasArtistBadgeSvg(expectedChannelName)
	{
		const svgPath = document.querySelector(`#owner path[d="${ARTIST_BADGE_SVG_PATH}"], ytd-channel-name path[d="${ARTIST_BADGE_SVG_PATH}"]`);
		if (!svgPath) return false;

		// Verify the found badge belongs to the current channel element, not a previous one
		if (expectedChannelName)
		{
			const ownerContainer = svgPath.closest("#owner, ytd-video-owner-renderer, ytd-channel-name");
			if (ownerContainer)
			{
				const text = ownerContainer.textContent?.trim() || "";
				const cleanExpected = expectedChannelName.toLowerCase().replace(/\s+/g, " ").trim();
				const cleanText = text.toLowerCase().replace(/\s+/g, " ").trim();
				if (!cleanText.includes(cleanExpected))
				{
					return false;
				}
			}
		}
		return true;
	}

	function getVideoTitle()
	{
		return document.querySelector(TITLE_SELECTOR_COMBINED)?.textContent?.trim() ?? "";
	}

	function titleMatchesMusicKeyword(title)
	{
		return title ? TITLE_KEYWORDS_REGEX.test(title) : false;
	}

	function isOfficialArtistChannel(expectedChannelName)
	{
		const badge = document.querySelector(BADGE_SELECTOR_COMBINED);
		if (!badge) return false;

		// Verify the found badge belongs to the current channel element, not a previous one
		if (expectedChannelName)
		{
			const ownerContainer = badge.closest("#owner, ytd-video-owner-renderer, ytd-channel-name");
			if (ownerContainer)
			{
				const text = ownerContainer.textContent?.trim() || "";
				const cleanExpected = expectedChannelName.toLowerCase().replace(/\s+/g, " ").trim();
				const cleanText = text.toLowerCase().replace(/\s+/g, " ").trim();
				if (!cleanText.includes(cleanExpected))
				{
					return false;
				}
			}
		}
		return true;
	}

	function isMusicCategory(pr)
	{
		const category = pr?.microformat?.playerMicroformatRenderer?.category;
		if (category && category.toLowerCase() === "music") return true;

		const expectedChannelName = pr?.videoDetails?.author;

		if (isOfficialArtistChannel(expectedChannelName)) return true;
		if (hasArtistBadgeSvg(expectedChannelName)) return true;

		const title = pr?.videoDetails?.title || getVideoTitle();
		return titleMatchesMusicKeyword(title);
	}

	function isDomSettledForChannel(expectedChannelName)
	{
		if (!expectedChannelName) return false;
		const ownerEl = document.querySelector("#owner, ytd-channel-name");
		if (!ownerEl) return false;

		const text = ownerEl.textContent?.trim() || "";
		const cleanExpected = expectedChannelName.toLowerCase().replace(/\s+/g, " ").trim();
		const cleanText = text.toLowerCase().replace(/\s+/g, " ").trim();

		return cleanText.includes(cleanExpected);
	}

	function isAdPlaying()
	{
		return document.querySelector(".ad-showing, .ad-interrupting, .html5-video-player.ad-showing") !== null;
	}

	async function checkMixIsMusic(videoId)
	{
		if (!videoId) return null;
		if (!window.ytcfg?.get) return null;

		const apiKey  = window.ytcfg.get("INNERTUBE_API_KEY");
		const context = window.ytcfg.get("INNERTUBE_CONTEXT");

		if (!apiKey || !context) return null;

		const fields =
			"contents.twoColumnWatchNextResults.playlist.playlist.contents." +
			"playlistPanelVideoRenderer.navigationEndpoint.watchEndpoint.playerParams";

		const endpoint =
			"https://www.youtube.com/youtubei/v1/next" +
			"?fields=" + encodeURIComponent(fields) +
			"&prettyPrint=false" +
			"&key=" + apiKey;

		// Cancel any outstanding fetch request from a previous navigation cycle
		if (mixAbortController)
		{
			mixAbortController.abort();
		}
		const controller = new AbortController();
		mixAbortController = controller;

		const timeoutId  = setTimeout(() => controller.abort(), MIX_CHECK_TIMEOUT_MS);

		try
		{
			const response = await fetch
			(
				endpoint,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ context, videoId, playlistId: "RD" + videoId }),
					signal: controller.signal,
				}
			);

			const json     = await response.json();
			const contents = json?.contents?.twoColumnWatchNextResults?.playlist?.playlist?.contents ?? [];

			const playerParams = contents
				.map(item => item?.playlistPanelVideoRenderer?.navigationEndpoint?.watchEndpoint?.playerParams)
				.find(params => typeof params === "string");

			if (!playerParams) return false;

			return playerParams.startsWith(PLAYER_PARAMS_MUSIC_PREFIX);
		}
		catch (error)
		{
			return null;
		}
		finally
		{
			clearTimeout(timeoutId);
			if (mixAbortController === controller)
			{
				mixAbortController = null;
			}
		}
	}

	function loadChannelSpeed(id)
	{
		if (!id) return null;
		try
		{
			const raw = localStorage.getItem(CH_PREFIX + id);
			if (!raw) return null;
			const data = JSON.parse(raw);
			return data?.speed > 0 ? data.speed : null;
		}
		catch (_)
		{
			return null;
		}
	}

	function saveChannelSpeed(id, speed, channelName)
	{
		if (!id) return;
		const def = getEfytDefaultSpeed();
		const resolvedName = channelName || id;

		try
		{
			if (Math.abs(speed - def) < 0.001)
			{
				localStorage.removeItem(CH_PREFIX + id);
				console.log(`[EfYT-ChSpeed] Cleared override for ${resolvedName} (matches default ${def}x)`);
			}
			else
			{
				const payload =
				{
					speed: speed,
					name: channelName || "Unknown Channel"
				};
				localStorage.setItem(CH_PREFIX + id, JSON.stringify(payload));
				console.log(`[EfYT-ChSpeed] Saved ${speed}x for ${resolvedName}`);
			}
		}
		catch (error)
		{
			console.warn(`[EfYT-ChSpeed] Could not persist speed for ${resolvedName}:`, error);
		}
	}

	// -----------------------------------------------------------
	// Programmatic Speed Shifting
	// -----------------------------------------------------------

	function stepToSpeed(target)
	{
		const v = document.querySelector("video");
		if (!v) return false;

		const plus  = document.getElementById("efyt-speed-plus");
		const minus = document.getElementById("efyt-speed-minus");

		if (plus && minus)
		{
			const MAX_CLICKS = 30;
			let guard = 0;

			while (Math.abs(v.playbackRate - target) > 0.001 && guard++ < MAX_CLICKS)
			{
				const before = v.playbackRate;
				(target > before ? plus : minus).click();

				if (v.playbackRate === before) break;
			}
		}

		if (Math.abs(v.playbackRate - target) > 0.001)
		{
			v.playbackRate = target;
			console.log(`[EfYT-ChSpeed] PlaybackRate set directly to ${target}x (UI controls unavailable)`);
		}

		return Math.abs(v.playbackRate - target) < 0.001;
	}

	function applySpeedWithSuppress(target)
	{
		suppressSave = true;
		if (suppressTimeoutId) clearTimeout(suppressTimeoutId);

		stepToSpeed(target);

		suppressTimeoutId = setTimeout(() =>
		{
			suppressSave = false;
			suppressTimeoutId = null;
		}, SUPPRESS_RESET_MS);
	}

	// -----------------------------------------------------------
	// Captured Event Delegation
	// -----------------------------------------------------------

	function onRateChange(e)
	{
		if (suppressSave || isAdPlaying()) return;

		const v = e.target;
		if (v.tagName !== "VIDEO" || !v.closest("#movie_player")) return;

		const videoId = getWatchVideoId();
		if (!videoId || videoId !== activeVideoId) return;

		const pr = document.getElementById("movie_player")?.getPlayerResponse();
		if (isMusicCategory(pr)) return;

		const id = lastChannelId || getChannelId(pr);
		const name = lastChannelName || getChannelName(pr);

		if (id)
		{
			const savedSpeed = loadChannelSpeed(id) ?? getEfytDefaultSpeed();
			if (Math.abs(v.playbackRate - savedSpeed) < 0.001) return;

			saveChannelSpeed(id, v.playbackRate, name);
		}
	}

	// -----------------------------------------------------------
	// Polling Page Evaluation Core
	// -----------------------------------------------------------

	function evaluateCurrentPage()
	{
		const videoId = getWatchVideoId();
		if (!videoId)
		{
			if (activeVideoId !== null)
			{
				activeVideoId   = null;
				lastChannelId   = null;
				lastChannelName = null;
				speedApplied    = false;
				musicChecked    = false;
			}
			return;
		}

		if (activeVideoId !== videoId)
		{
			console.log(`[EfYT-ChSpeed] Evaluating video session: ${videoId}`);
			activeVideoId       = videoId;
			lastChannelId       = null;
			lastChannelName     = null;
			speedApplied        = false;
			musicChecked        = false;
			suppressSave        = true;
		}

		const playerEl = document.getElementById("movie_player");
		const videoEl = playerEl?.querySelector("video") || document.querySelector("video");
		const pr = playerEl?.getPlayerResponse?.();

		if (!videoEl || !playerEl || !pr || pr.videoDetails?.videoId !== videoId) return;

		const hasButtons = document.getElementById("efyt-speed-plus") && document.getElementById("efyt-speed-minus");
		if (!hasButtons) return;

		// 1. Resolve and apply recorded channel speed
		if (!speedApplied)
		{
			const channelId = getChannelId(pr);
			const channelName = getChannelName(pr);
			if (channelId)
			{
				lastChannelId   = channelId;
				lastChannelName = channelName;
				const saved = loadChannelSpeed(channelId);
				if (saved)
				{
					console.log(`[EfYT-ChSpeed] Applying speed ${saved}x for ${channelName}`);
					applySpeedWithSuppress(saved);
				}
				else
				{
					const def = getEfytDefaultSpeed();
					console.log(`[EfYT-ChSpeed] Applying default ${def}x for ${channelName}`);
					applySpeedWithSuppress(def);
				}
				speedApplied = true;
			}
		}

		// 2. Resolve and apply forced 1x music speed
		if (!musicChecked)
		{
			const isMusic = isMusicCategory(pr);
			const channelName = lastChannelName || getChannelName(pr);
			const domSettled = isDomSettledForChannel(channelName);

			if (isMusic)
			{
				console.log(`[EfYT-ChSpeed] Music video detected — forcing 1x speed for ${channelName}`);
				applySpeedWithSuppress(1);
				musicChecked = true;
				speedApplied = true; 
				clearPolling();
			}
			else if (domSettled && speedApplied)
			{
				console.log(`[EfYT-ChSpeed] DOM structure settled for ${channelName}. Running non-music configurations.`);

				checkMixIsMusic(videoId).then(isMixMusic =>
				{
					if (activeVideoId !== videoId) return;
					if (isMixMusic)
					{
						console.log(`[EfYT-ChSpeed] Playlist Mix API confirmed Music — forcing 1x speed for ${channelName}`);
						applySpeedWithSuppress(1);
					}
				});

				musicChecked = true;
				clearPolling();
			}
		}

		if (speedApplied && musicChecked)
		{
			clearPolling();
		}
	}

	function setupPolling()
	{
		clearPolling();
		suppressSave = true;

		function poll()
		{
			if (document.hidden)
			{
				retryTimeoutId = setTimeout(poll, 1000);
				return;
			}

			evaluateCurrentPage();
			if (!speedApplied || !musicChecked)
			{
				retryTimeoutId = setTimeout(poll, 150);
			}
		}
		poll();

		cutoffTimeoutId = setTimeout(() =>
		{
			clearPolling();
		}, 5000);
	}

	function clearPolling()
	{
		if (retryTimeoutId)
		{
			clearTimeout(retryTimeoutId);
			retryTimeoutId = null;
		}
		if (cutoffTimeoutId)
		{
			clearTimeout(cutoffTimeoutId);
			cutoffTimeoutId = null;
		}
		suppressSave = false;
	}

	function onVideoNavigation()
	{
		const videoId = getWatchVideoId();
		if (!videoId)
		{
			clearPolling();
			activeVideoId = null;
			if (mixAbortController)
			{
				mixAbortController.abort();
				mixAbortController = null;
			}
			return;
		}

		if (activeVideoId === videoId)
		{
			return;
		}

		console.log(`[EfYT-ChSpeed] New video navigation: ${videoId}`);
		activeVideoId       = videoId;
		lastChannelId       = null;
		lastChannelName     = null;
		speedApplied        = false;
		musicChecked        = false;

		if (mixAbortController)
		{
			mixAbortController.abort();
			mixAbortController = null;
		}

		setupPolling();
	}

	function onVisibilityChange()
	{
		if (!document.hidden)
		{
			if (!speedApplied || !musicChecked)
			{
				console.log("[EfYT-ChSpeed] Tab activated with unresolved state — re-arming polling.");
				setupPolling();
				evaluateCurrentPage();
			}
		}
	}

	// -----------------------------------------------------------
	// Event Listeners
	// -----------------------------------------------------------

	window.addEventListener("yt-navigate-finish", onVideoNavigation);
	window.addEventListener("yt-page-data-updated", onVideoNavigation);
	window.addEventListener("ratechange", onRateChange, true);
	document.addEventListener("visibilitychange", onVisibilityChange);

	onVideoNavigation();

	// -----------------------------------------------------------
	// Public API
	// -----------------------------------------------------------

	const chKeys = () => Object.keys(localStorage).filter(k => k.startsWith(CH_PREFIX));

	window.efytSpeed =
	{
		refresh()
		{
			console.log("[EfYT-ChSpeed] Manual refresh.");
			activeVideoId = null;
			lastChannelId = null;
			lastChannelName = null;
			onVideoNavigation();
		},

		getWatchVideoId()
		{
			const id = getWatchVideoId();
			console.log("[EfYT-ChSpeed] Watch video ID:", id ?? "(not found)");
			return id;
		},

		getChannelId()
		{
			const pr = document.getElementById("movie_player")?.getPlayerResponse();
			const id = getChannelId(pr) ?? null;
			console.log("[EfYT-ChSpeed] Channel ID:", id ?? "(not found)");
			return id;
		},

		isOfficialArtistChannel()
		{
			const pr = document.getElementById("movie_player")?.getPlayerResponse();
			const expectedName = pr?.videoDetails?.author;
			const isArtist = isOfficialArtistChannel(expectedName);
			console.log("[EfYT-ChSpeed] Official Artist Channel:", isArtist);
			return isArtist;
		},

		hasArtistBadgeSvg()
		{
			const pr = document.getElementById("movie_player")?.getPlayerResponse();
			const expectedName = pr?.videoDetails?.author;
			const hasSvg = hasArtistBadgeSvg(expectedName);
			console.log("[EfYT-ChSpeed] Artist badge SVG present:", hasSvg);
			return hasSvg;
		},

		getVideoTitle()
		{
			const pr = document.getElementById("movie_player")?.getPlayerResponse();
			const title = pr?.videoDetails?.title || getVideoTitle();
			console.log("[EfYT-ChSpeed] Video title:", title || "(not found)");
			return title;
		},

		titleMatchesMusicKeyword(title = (document.getElementById("movie_player")?.getPlayerResponse()?.videoDetails?.title || getVideoTitle()))
		{
			const matches = titleMatchesMusicKeyword(title);
			console.log(`[EfYT-ChSpeed] Title "${title}" matches keyword:`, matches);
			return matches;
		},

		checkMixIsMusic(videoId = getWatchVideoId())
		{
			return checkMixIsMusic(videoId).then(isMusic =>
			{
				console.log("[EfYT-ChSpeed] Mix check result:", isMusic);
				return isMusic;
			});
		},

		isMusicCategory()
		{
			const isMusic = isMusicCategory(document.getElementById("movie_player")?.getPlayerResponse());
			console.log("[EfYT-ChSpeed] Is music category:", isMusic);
			return isMusic;
		},

		getDefaultSpeed()
		{
			const s = getEfytDefaultSpeed();
			console.log("[EfYT-ChSpeed] Default:", s + "x");
			return s;
		},

		getSpeed(id)
		{
			const pr = document.getElementById("movie_player")?.getPlayerResponse();
			const channelId = id || getChannelId(pr);
			const s = loadChannelSpeed(channelId);
			const name = lastChannelName || (pr ? getChannelName(pr) : channelId);
			console.log(`[EfYT-ChSpeed] Speed for ${name || "(none)"}:`, s ? s + "x" : "(none)");
			return s;
		},

		setSpeed(speed, id)
		{
			const pr = document.getElementById("movie_player")?.getPlayerResponse();
			const channelId = id || getChannelId(pr);
			const name = lastChannelName || (pr ? getChannelName(pr) : channelId);
			if (!channelId)
			{
				console.warn("[EfYT-ChSpeed] No channel detected.");
				return;
			}
			saveChannelSpeed(channelId, speed, name);
			stepToSpeed(speed);
		},

		clearSpeed(id)
		{
			const pr = document.getElementById("movie_player")?.getPlayerResponse();
			const channelId = id || getChannelId(pr);
			const name = lastChannelName || (pr ? getChannelName(pr) : channelId);
			if (!channelId)
			{
				console.warn("[EfYT-ChSpeed] No channel detected.");
				return;
			}
			localStorage.removeItem(CH_PREFIX + channelId);
			console.log(`[EfYT-ChSpeed] Cleared speed for ${name}.`);
		},

		clearAll()
		{
			const keys = chKeys();
			keys.forEach(k => localStorage.removeItem(k));
			console.log(`[EfYT-ChSpeed] Cleared ${keys.length} override(s).`);
		},

		export()
		{
			const out = {};
			chKeys().forEach(k => {
				const key = k.slice(CH_PREFIX.length);
				const raw = localStorage.getItem(k);
				try
				{
					out[key] = JSON.parse(raw);
				}
				catch (_)
				{
					out[key] = { speed: parseFloat(raw), name: "Unknown" };
				}
			});
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

		import()
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
				for (const [id, value] of Object.entries(parsed))
				{
					if (value && typeof value === "object" && value.speed !== undefined)
					{
						const speed = parseFloat(value.speed);
						if (isNaN(speed) || speed <= 0) continue;
						localStorage.setItem(CH_PREFIX + id, JSON.stringify(value));
						count++;
					}
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

				const timeoutId = setTimeout
				(
					() =>
					{
						if (inputController.signal.aborted) return;
						overlayController.abort();
						inputController.abort();
						overlay.remove();
						input.remove();
						console.log("[EfYT-ChSpeed] Import cancelled — button timed out.");
					},
					8000
				);

				input.addEventListener
				(
					"change",
					() =>
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
					},
					{ signal: inputController.signal }
				);

				overlay.addEventListener
				(
					"click",
					() =>
					{
						clearTimeout(timeoutId);
						overlayController.abort();
						overlay.remove();
						input.click();
					},
					{ signal: overlayController.signal }
				);

				document.body.appendChild(overlay);
				document.body.appendChild(input);

				console.log("[EfYT-ChSpeed] Click the blue button in the top-right corner to choose a file.");
			}

			showImportButton();
		},

		help()
		{
			console.log
			(
				`%c[EfYT-ChSpeed] Commands:

%cDetection
%c  efytSpeed.isMusicCategory()              → true if any detection layer matches
  efytSpeed.isOfficialArtistChannel()      → checks badge selectors only
  efytSpeed.hasArtistBadgeSvg()            → checks badge SVG icon
  efytSpeed.getVideoTitle()                → current video title
  efytSpeed.titleMatchesMusicKeyword([t])  → test a title against keywords
  efytSpeed.checkMixIsMusic([id])          → async Mix-API fallback check

%cNavigation
%c  efytSpeed.getWatchVideoId()              → current video ID

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
				"color:#ccc",
				"color:#8ab4f8;font-weight:bold",
				"color:#ccc"
			);
		},
	};

	console.log("%c[EfYT-ChSpeed] Active. %cType efytSpeed.help() for commands.", "color:#fff;font-weight:bold", "color:#aaa");
})();