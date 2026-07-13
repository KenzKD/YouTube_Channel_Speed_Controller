// ============================================================
// Enhancer for YouTube™ — Remember Speed Per Channel (v39.2)
// Paste this into: EfYT Options → Custom Script
// ============================================================

(function ()
{
	"use strict";

	if (window.efytSpeedInitialized) return;
	window.efytSpeedInitialized = true;

	// ============================================================
	// CONFIGURATION
	// ============================================================
	const DEFAULT_SPEED_FALLBACK = 2;

	const SUPPRESS_RESET_MS = 500;
	const MIX_CHECK_TIMEOUT_MS = 4000;
	const EFYT_KEY = "enhancer-for-youtube";
	const PLAYER_PARAMS_MUSIC_PREFIX = "8AUB";
	const CH_PREFIX = "efyt_ch_speed::";
	const LOG_PREFIX = "[EfYT-ChSpeed]";

	// Helpers for logging
	const log = (...args) => console.log(LOG_PREFIX, ...args);
	const warn = (...args) => console.warn(LOG_PREFIX, ...args);
	const err = (...args) => console.error(LOG_PREFIX, ...args);

	const ARTIST_BADGE_SVG_PATH = "M9.03 2.242 8.272 3H7.2A4.2 4.2 0 003 7.2v1.072l-.758.758a4.2 4.2 0 000 5.94l.758.758V16.8A4.2 4.2 0 007.2 21h1.072l.758.758a4.2 4.2 0 005.94 0l.758-.758H16.8a4.2 4.2 0 004.2-4.2v-1.072l.758-.758a4.2 4.2 0 000-5.94L21 8.272V7.2A4.2 4.2 0 0016.8 3h-1.072l-.758-.758a4.2 4.2 0 00-5.94 0Zm7.73 6.638a.5.5 0 01.241.427v1.743a.256.256 0 01-.386.219L14.001 9.7v4.55a2.75 2.75 0 11-2-2.646V6.888a.5.5 0 01.759-.428l4 2.42Z";
	
	// English aria-labels, legacy classes, and modern structural classes
	const BADGE_SELECTOR_COMBINED = [
		'badge-shape[aria-label="Official Artist Channel"]',
		'[aria-label="Official Artist Channel"]',
		'.badge-style-type-verified-artist',
		'badge-shape.yt-badge-shape--verified-artist',
		'badge-shape[class*="verified-artist"]',
		'.yt-badge-shape--verified-artist'
	].join(', ');

	const TITLE_SELECTOR_COMBINED = "ytd-watch-metadata h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, h1.ytd-video-primary-info-renderer";

	const TITLE_KEYWORDS = [
		"official audio", "official video", "music video", "mv", "official lyric video",
		"official visualizer", "lyric video", "lyrics", "audio only", "visualizer",
		"dance", "choreography", "choreo",
		"acoustic cover", "remix", "mashup", "type beat",
		"dj set", "live set", "live session", "live performance",
		"karaoke", "instrumental", "backing track",
		"lofi", "lo-fi", "study music", "workout mix", "gym mix", "chill mix",
		"sped up", "slowed", "nightcore", "8d audio",
		"full album", "album stream", "sfx", "sound effect",
	];

	const TITLE_KEYWORDS_REGEX = new RegExp(
		TITLE_KEYWORDS.map(keyword =>
		{
			const escapedKeyword = keyword.replace(/[\/\\^$*+?.()|[\]{}]/g, "\\$&").replace(/\s+/g, "\\s+");
			return (keyword === "mv" || keyword === "sfx") ? `\\b${escapedKeyword}\\b` : escapedKeyword;
		}).join("|"), "i"
	);

	// ============================================================
	// STATE MANAGEMENT
	// ============================================================
	const state =
	{
		suppressSave: false,
		activeVideoId: null,
		lastChannelId: null,
		lastChannelName: null,
		speedApplied: false,
		musicChecked: false,
		mixAbortController: null,
		timers:
		{
			suppress: null,
			retry: null,
			cutoff: null
		},

		resetSession()
		{
			this.activeVideoId = null;
			this.lastChannelId = null;
			this.lastChannelName = null;
			this.speedApplied = false;
			this.musicChecked = false;
		},

		abortMixCheck()
		{
			if (this.mixAbortController)
			{
				this.mixAbortController.abort();
				this.mixAbortController = null;
			}
		}
	};

	// ============================================================
	// HELPERS
	// ============================================================
	const getMoviePlayer = () => document.getElementById("movie_player");
	const fetchPlayerResponse = () => getMoviePlayer()?.getPlayerResponse();

	function getEfytDefaultSpeed()
	{
		try
		{
			const parsedData = JSON.parse(localStorage.getItem(EFYT_KEY));
			const defaultSpeed = parsedData?.speed;
			return (defaultSpeed > 0) ? defaultSpeed : DEFAULT_SPEED_FALLBACK;
		}
		catch
		{
			return DEFAULT_SPEED_FALLBACK;
		}
	}

	function fetchWatchVideoId(playerResponse = fetchPlayerResponse())
	{
		return playerResponse?.videoDetails?.videoId
			?? location.search.match(/[?&]v=([^&#]+)/)?.[1]
			?? document.querySelector("ytd-watch-flexy")?.getAttribute("video-id");
	}

	const fetchChannelId = (playerResponse = fetchPlayerResponse()) => playerResponse?.videoDetails?.channelId;

	const fetchChannelName = (playerResponse = fetchPlayerResponse()) => playerResponse?.videoDetails?.author
		?? document.querySelector("ytd-channel-name yt-formatted-string, #owner ytd-channel-name a")?.textContent?.trim()
		?? "Unknown Channel";

	const textIncludesNormalized = (sourceText, targetText) => !!(sourceText && targetText && sourceText.toLowerCase().replace(/\s+/g, " ").trim().includes(targetText.toLowerCase().replace(/\s+/g, " ").trim()));

	// Normalize SVG path representations to protect against browser spacing changes
	const isArtistSvgPath = (d) =>
	{
		if (!d) return false;
		const normalizedD = d.replace(/[\s,]+/g, " ").trim();
		
		// Match standard music note path prefixes
		if (normalizedD.startsWith("M12 3v10") || normalizedD.startsWith("M12 3 v10")) return true;
		
		// Match scalloped badge outline path prefixes
		if (normalizedD.startsWith("M9.03 2.24") || normalizedD.startsWith("M9.03 2.242")) return true;
		
		// Exact comparison fallback
		if (normalizedD === ARTIST_BADGE_SVG_PATH.replace(/[\s,]+/g, " ").trim()) return true;
		
		return false;
	};

	const containerMatchesChannel = (element, expectedChannelName) =>
	{
		const ownerContainer = element.closest("#owner, ytd-video-owner-renderer, ytd-channel-name");
		if (!ownerContainer) return false;

		// If the badge is verified inside the main metadata block of the watch page, 
		// it is associated with the active video. This skips string name comparison checks.
		const isMainWatchOwner = !!element.closest("ytd-watch-metadata #owner, ytd-watch-metadata ytd-video-owner-renderer, ytd-video-primary-info-renderer #owner");
		if (isMainWatchOwner) return true;

		if (!expectedChannelName || expectedChannelName === "Unknown Channel") return true;

		return textIncludesNormalized(ownerContainer.textContent, expectedChannelName);
	};

	const checkArtistBadgeSvg = (expectedChannelName) =>
	{
		const paths = document.querySelectorAll('#owner path, ytd-channel-name path, ytd-video-owner-renderer path');
		for (const path of paths)
		{
			const d = path.getAttribute("d");
			if (isArtistSvgPath(d) && containerMatchesChannel(path, expectedChannelName))
			{
				return true;
			}
		}
		return false;
	};

	const fetchVideoTitle = (playerResponse = fetchPlayerResponse()) => playerResponse?.videoDetails?.title
		?? document.querySelector(TITLE_SELECTOR_COMBINED)?.textContent?.trim()
		?? "";
	
	const checkTitleMatchesMusicKeyword = (videoTitle) => videoTitle ? TITLE_KEYWORDS_REGEX.test(videoTitle) : false;
	
	const checkOfficialArtistChannel = (expectedChannelName) =>
	{
		const badges = document.querySelectorAll(BADGE_SELECTOR_COMBINED);
		for (const badge of badges)
		{
			if (containerMatchesChannel(badge, expectedChannelName)) return true;
		}
		return false;
	};

	function isMusicCategory(playerResponse = fetchPlayerResponse())
	{
		if (playerResponse?.microformat?.playerMicroformatRenderer?.category?.toLowerCase() === "music") return true;
		
		const authorName = playerResponse?.videoDetails?.author;
		
		if (checkOfficialArtistChannel(authorName) || checkArtistBadgeSvg(authorName)) return true;
		
		const videoTitle = fetchVideoTitle(playerResponse);
		return checkTitleMatchesMusicKeyword(videoTitle);
	}

	const checkDomSettledForChannel = (expectedChannelName) => expectedChannelName ? textIncludesNormalized(document.querySelector("#owner, ytd-channel-name")?.textContent, expectedChannelName) : false;
	
	const isAdPlaying = () =>
	{
		const player = getMoviePlayer();
		return !!(
			player?.classList.contains("ad-showing") ||
			player?.getAdState?.() > 0 ||
			document.querySelector(".ad-showing, .ad-interrupting")
		);
	};

	async function verifyMixIsMusic(videoId)
	{
		if (!videoId || !window.ytcfg?.get) return null;
		
		const innerTubeApiKey = window.ytcfg.get("INNERTUBE_API_KEY");
		const innerTubeContext = window.ytcfg.get("INNERTUBE_CONTEXT");
		
		if (!innerTubeApiKey || !innerTubeContext) return null;

		const apiEndpoint = `https://www.youtube.com/youtubei/v1/next?key=${innerTubeApiKey}`;

		state.abortMixCheck();
		const abortController = new AbortController();
		state.mixAbortController = abortController;
		
		const fetchTimeoutId = setTimeout(() => abortController.abort(), MIX_CHECK_TIMEOUT_MS);

		try
		{
			const networkResponse = await fetch(apiEndpoint,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ context: innerTubeContext, videoId, playlistId: "RD" + videoId }),
				signal: abortController.signal,
			});

			if (!networkResponse.ok) return null;
			
			const responseData = await networkResponse.json();
			const playlistContents = responseData?.contents?.twoColumnWatchNextResults?.playlist?.playlist?.contents ?? [];
			
			const activeVideoData = playlistContents.find(playlistItem => playlistItem?.playlistPanelVideoRenderer?.videoId === videoId);
			const playerParameters = activeVideoData?.playlistPanelVideoRenderer?.navigationEndpoint?.watchEndpoint?.playerParams;

			return typeof playerParameters === "string" ? playerParameters.startsWith(PLAYER_PARAMS_MUSIC_PREFIX) : false;
		}
		catch
		{
			return null;
		}
		finally
		{
			clearTimeout(fetchTimeoutId);
			if (state.mixAbortController === abortController) state.mixAbortController = null;
		}
	}

	// ============================================================
	// STORAGE & CONTROLS
	// ============================================================
	function loadChannelSpeed(channelId)
	{
		if (!channelId) return null;
		try
		{
			const storedData = JSON.parse(localStorage.getItem(CH_PREFIX + channelId));
			const channelSpeed = storedData?.speed;
			return channelSpeed > 0 ? channelSpeed : null;
		}
		catch
		{
			return null;
		}
	}

	function saveChannelSpeed(channelId, targetSpeed, channelName)
	{
		if (!channelId) return;
		
		const defaultEfytSpeed = getEfytDefaultSpeed();
		const resolvedChannelName = channelName || channelId;

		try
		{
			if (Math.abs(targetSpeed - defaultEfytSpeed) < 0.001)
			{
				localStorage.removeItem(CH_PREFIX + channelId);
				log(`Cleared override for ${resolvedChannelName} (matches default ${defaultEfytSpeed}x)`);
			}
			else
			{
				localStorage.setItem(CH_PREFIX + channelId, JSON.stringify({ speed: targetSpeed, name: channelName || "Unknown Channel" }));
				log(`Saved ${targetSpeed}x for ${resolvedChannelName}`);
			}
		}
		catch (storageError)
		{
			warn(`Could not persist speed for ${resolvedChannelName}:`, storageError);
		}
	}

	function stepToSpeed(targetPlaybackRate)
	{
		const videoElement = document.querySelector("video");
		if (!videoElement) return false;

		const speedUpButton = document.getElementById("efyt-speed-plus");
		const speedDownButton = document.getElementById("efyt-speed-minus");

		if (speedUpButton && speedDownButton)
		{
			let attemptCount = 0;
			while (Math.abs(videoElement.playbackRate - targetPlaybackRate) > 0.001 && attemptCount++ < 30)
			{
				const previousPlaybackRate = videoElement.playbackRate;
				
				if (targetPlaybackRate > previousPlaybackRate)
				{
					speedUpButton.click();
				}
				else
				{
					speedDownButton.click();
				}
				
				if (videoElement.playbackRate === previousPlaybackRate) break;
			}
		}

		if (Math.abs(videoElement.playbackRate - targetPlaybackRate) > 0.001)
		{
			videoElement.playbackRate = targetPlaybackRate;
			log(`PlaybackRate set directly to ${targetPlaybackRate}x (UI controls unavailable)`);
		}
		
		return Math.abs(videoElement.playbackRate - targetPlaybackRate) < 0.001;
	}

	function applySpeedWithSuppress(targetPlaybackRate)
	{
		state.suppressSave = true;
		clearTimeout(state.timers.suppress);
		
		stepToSpeed(targetPlaybackRate);
		
		state.timers.suppress = setTimeout(() => 
		{ 
			state.suppressSave = false; 
		}, SUPPRESS_RESET_MS);
	}

	function clearPolling()
	{
		clearTimeout(state.timers.retry);
		clearTimeout(state.timers.cutoff);
		state.suppressSave = false;
	}

	// ============================================================
	// EVENT DELEGATION & POLLING
	// ============================================================
	function onRateChange(event)
	{
		if (state.suppressSave || isAdPlaying()) return;
		
		const videoElement = event.target;
		if (videoElement.tagName !== "VIDEO" || !videoElement.closest("#movie_player")) return;

		const playerResponse = fetchPlayerResponse();
		const activeVideoId = fetchWatchVideoId(playerResponse);
		if (!activeVideoId || activeVideoId !== state.activeVideoId) return;

		if (isMusicCategory(playerResponse)) return;

		const targetChannelId = state.lastChannelId || fetchChannelId(playerResponse);
		
		if (targetChannelId)
		{
			const storedChannelSpeed = loadChannelSpeed(targetChannelId) ?? getEfytDefaultSpeed();
			if (Math.abs(videoElement.playbackRate - storedChannelSpeed) >= 0.001)
			{
				const activeChannelName = state.lastChannelName || fetchChannelName(playerResponse);
				saveChannelSpeed(targetChannelId, videoElement.playbackRate, activeChannelName);
			}
		}
	}

	function evaluateCurrentPage()
	{
		const playerResponse = fetchPlayerResponse();
		const activeVideoId = fetchWatchVideoId(playerResponse);
		
		if (!activeVideoId)
		{
			if (state.activeVideoId !== null) state.resetSession();
			return;
		}

		if (state.activeVideoId !== activeVideoId)
		{
			log(`Evaluating video session: ${activeVideoId}`);
			state.resetSession();
			state.activeVideoId = activeVideoId;
			state.suppressSave = true;
		}

		const videoElement = getMoviePlayer()?.querySelector("video") || document.querySelector("video");
		
		if (!videoElement || !playerResponse || playerResponse.videoDetails?.videoId !== activeVideoId || !document.getElementById("efyt-speed-plus")) return;

		// 1. Channel Speed
		if (!state.speedApplied)
		{
			const channelId = fetchChannelId(playerResponse);
			if (channelId)
			{
				state.lastChannelId = channelId;
				state.lastChannelName = fetchChannelName(playerResponse);
				
				const targetSpeed = loadChannelSpeed(channelId) ?? getEfytDefaultSpeed();
				
				log(`Applying speed ${targetSpeed}x for ${state.lastChannelName}`);
				applySpeedWithSuppress(targetSpeed);
				state.speedApplied = true;
			}
		}

		// 2. Music Check Override
		if (!state.musicChecked)
		{
			const isMusicVideo = isMusicCategory(playerResponse);
			const activeChannelName = state.lastChannelName || fetchChannelName(playerResponse);

			if (isMusicVideo)
			{
				log(`Music video detected — forcing 1x speed for ${activeChannelName}`);
				applySpeedWithSuppress(1);
				state.musicChecked = state.speedApplied = true;
				clearPolling();
			}
			else if (checkDomSettledForChannel(activeChannelName) && state.speedApplied)
			{
				log(`DOM settled for ${activeChannelName}. Running non-music configs.`);
				verifyMixIsMusic(activeVideoId).then(isMixMusic =>
				{
					if (state.activeVideoId === activeVideoId && isMixMusic)
					{
						log(`Playlist Mix API confirmed Music — forcing 1x speed for ${activeChannelName}`);
						applySpeedWithSuppress(1);
					}
				});
				state.musicChecked = true;
				clearPolling();
			}
		}

		if (state.speedApplied && state.musicChecked) clearPolling();
	}

	function setupPolling()
	{
		clearPolling();
		state.suppressSave = true;

		const pollForElements = () =>
		{
			if (document.hidden)
			{
				state.timers.retry = setTimeout(pollForElements, 1000);
				return;
			}
			evaluateCurrentPage();
			if (!state.speedApplied || !state.musicChecked)
			{
				state.timers.retry = setTimeout(pollForElements, 150);
			}
		};

		pollForElements();
		state.timers.cutoff = setTimeout(clearPolling, 5000);
	}

	function onVideoNavigation()
	{
		const playerResponse = fetchPlayerResponse();
		const currentVideoId = fetchWatchVideoId(playerResponse);
		
		if (!currentVideoId)
		{
			clearPolling();
			state.activeVideoId = null;
			state.abortMixCheck();
			return;
		}

		if (state.activeVideoId === currentVideoId) return;

		log(`New video navigation: ${currentVideoId}`);
		state.resetSession();
		state.activeVideoId = currentVideoId;
		state.abortMixCheck();
		setupPolling();
	}

	function onVisibilityChange()
	{
		if (!document.hidden && (!state.speedApplied || !state.musicChecked))
		{
			log("Tab activated with unresolved state — re-arming polling.");
			setupPolling();
			evaluateCurrentPage();
		}
	}

	window.addEventListener("yt-navigate-finish", onVideoNavigation);
	window.addEventListener("yt-page-data-updated", onVideoNavigation);
	window.addEventListener("ratechange", onRateChange, true);
	document.addEventListener("visibilitychange", onVisibilityChange);
	onVideoNavigation();

	// ============================================================
	// PUBLIC API
	// ============================================================
	const fetchChannelKeys = () => Object.keys(localStorage).filter(storageKey => storageKey.startsWith(CH_PREFIX));

	window.efytSpeed =
	{
		refresh()
		{
			log("Manual refresh triggered.");
			state.activeVideoId = null;
			onVideoNavigation();
		},

		getWatchVideoId()
		{
			const videoId = fetchWatchVideoId();
			log("Watch ID:", videoId);
			return videoId;
		},

		getChannelId()
		{
			const channelId = fetchChannelId();
			log("Channel ID:", channelId);
			return channelId;
		},

		isOfficialArtistChannel()
		{
			const pr = fetchPlayerResponse();
			const isArtist = checkOfficialArtistChannel(pr?.videoDetails?.author);
			log("Official Artist Channel:", isArtist);
			return isArtist;
		},

		hasArtistBadgeSvg()
		{
			const pr = fetchPlayerResponse();
			const hasBadge = checkArtistBadgeSvg(pr?.videoDetails?.author);
			log("Artist badge SVG present:", hasBadge);
			return hasBadge;
		},

		getVideoTitle()
		{
			const videoTitle = fetchVideoTitle();
			log("Video Title:", videoTitle);
			return videoTitle;
		},

		titleMatchesMusicKeyword(videoTitle = fetchVideoTitle())
		{
			const isMatch = checkTitleMatchesMusicKeyword(videoTitle);
			log(`Title matches keyword:`, isMatch);
			return isMatch;
		},

		async checkMixIsMusic(videoId = fetchWatchVideoId())
		{
			const isMixMusic = await verifyMixIsMusic(videoId);
			log("Playlist mix confirmed music:", isMixMusic);
			return isMixMusic;
		},

		isMusicCategory()
		{
			const isMusic = isMusicCategory();
			log("Music category detected:", isMusic);
			return isMusic;
		},

		getDefaultSpeed()
		{
			const defaultSpeed = getEfytDefaultSpeed();
			log("Default EfYT Speed:", defaultSpeed + "x");
			return defaultSpeed;
		},

		getSpeed(channelId)
		{
			const targetChannelId = channelId || fetchChannelId();
			const savedSpeed = loadChannelSpeed(targetChannelId);
			
			log(`Saved speed for ${state.lastChannelName || targetChannelId}:`, savedSpeed ? savedSpeed + "x" : "(none)");
			return savedSpeed;
		},

		setSpeed(targetSpeed, channelId)
		{
			const playerResponse = fetchPlayerResponse();
			const targetChannelId = channelId || fetchChannelId(playerResponse);
			if (!targetChannelId) return warn("No channel detected.");
			
			saveChannelSpeed(targetChannelId, targetSpeed, state.lastChannelName || fetchChannelName(playerResponse));
			stepToSpeed(targetSpeed);
		},

		clearSpeed(channelId)
		{
			const playerResponse = fetchPlayerResponse();
			const targetChannelId = channelId || fetchChannelId(playerResponse);
			if (!targetChannelId) return warn("No channel detected.");
			
			localStorage.removeItem(CH_PREFIX + targetChannelId);
			log(`Cleared speed for ${state.lastChannelName || fetchChannelName(playerResponse)}.`);
		},

		clearAll()
		{
			const channelKeys = fetchChannelKeys();
			channelKeys.forEach(storageKey => localStorage.removeItem(storageKey));
			log(`Cleared ${channelKeys.length} saved channel override(s).`);
		},

		export()
		{
			const exportedData = Object.fromEntries(fetchChannelKeys().map(storageKey =>
			{
				const rawData = localStorage.getItem(storageKey);
				try
				{
					return [storageKey.slice(CH_PREFIX.length), JSON.parse(rawData)];
				}
				catch
				{
					return [storageKey.slice(CH_PREFIX.length), { speed: parseFloat(rawData), name: "Unknown" }];
				}
			}));

			const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(exportedData, null, 2)], { type: "application/json" }));
			const downloadAnchor = Object.assign(document.createElement("a"), { href: blobUrl, download: `efyt-channel-speeds_${new Date().toISOString().replace(/[:.]/g, "-")}.json` });
			
			document.body.appendChild(downloadAnchor);
			downloadAnchor.click();
			downloadAnchor.remove();
			URL.revokeObjectURL(blobUrl);
			
			log(`Exported ${Object.keys(exportedData).length} channel(s)`);
			return exportedData;
		},

		import()
		{
			const OVERLAY_ID = "efyt-chspeed-import-btn";
			if (document.getElementById(OVERLAY_ID)) return log("Import button is already visible.");

			const overlayButton = document.createElement("button");
			overlayButton.id = OVERLAY_ID;
			overlayButton.textContent = "📂 Click to choose EfYT speeds JSON";
			
			Object.assign(overlayButton.style,
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
				cursor: "pointer",
				boxShadow: "0 2px 8px rgba(0,0,0,0.3)"
			});

			const fileInput = Object.assign(document.createElement("input"),
			{
				type: "file",
				accept: ".json,application/json",
				style: "display:none"
			});
			
			const cleanupElements = () =>
			{
				overlayButton.remove();
				fileInput.remove();
			};

			fileInput.addEventListener("change", () =>
			{
				cleanupElements();
				const selectedFile = fileInput.files?.[0];
				if (!selectedFile || (selectedFile.type !== "application/json" && !selectedFile.name.endsWith(".json"))) return err("Import failed — invalid file type.");

				const fileReader = new FileReader();
				
				fileReader.onload = () =>
				{
					try
					{
						const parsedData = JSON.parse(fileReader.result);
						let importedCount = 0;
						
						for (const [channelId, channelData] of Object.entries(parsedData))
						{
							if (channelData?.speed > 0)
							{
								localStorage.setItem(CH_PREFIX + channelId, JSON.stringify(channelData));
								importedCount++;
							}
						}
						log(`Imported ${importedCount} channel(s).`);
					}
					catch
					{
						err("Import failed — invalid JSON format.");
					}
				};
				fileReader.readAsText(selectedFile);
			});

			overlayButton.addEventListener("click", () =>
			{
				cleanupElements();
				fileInput.click();
			});
			
			document.body.append(overlayButton, fileInput);
			setTimeout(cleanupElements, 8000);
			log("Click the blue button in the top-right corner to select a file.");
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
		}
	};

	console.log("%c[EfYT-ChSpeed] Active. %cType efytSpeed.help() for commands.", "color:#fff;font-weight:bold", "color:#aaa");
})();