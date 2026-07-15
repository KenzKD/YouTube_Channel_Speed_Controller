(async function runEfytTestSuite() {
	console.log("[EfYT-ChSpeed] %cStarting diagnostic and logic tests...", "color:#8ab4f8; font-weight:bold; font-size: 14px;");
	
	const results = { passed: 0, failed: 0 };

	function assert(condition, message) {
		if (condition) {
			console.log(`[EfYT-ChSpeed] %c[PASS]%c ${message}`, "color:#0f9d58; font-weight:bold;", "color:inherit;");
			results.passed++;
		} else {
			console.error(`[EfYT-ChSpeed] %c[FAIL]%c ${message}`, "color:#db4437; font-weight:bold;", "color:inherit;");
			results.failed++;
		}
	}

	function printSectionHeader(num, name, color) {
		console.log("[EfYT-ChSpeed] "); // spacing line that survives filtering
		console.log(`[EfYT-ChSpeed] %c============================================================`, `color: ${color}; opacity: 0.7;`);
		console.log(`[EfYT-ChSpeed] %c[SECTION ${num}] ${name}`, `color: ${color}; font-weight: bold; font-size: 12px;`);
		console.log(`[EfYT-ChSpeed] %c============================================================`, `color: ${color}; opacity: 0.7;`);
	}

	// ============================================================
	// 1. NAMESPACE INITIALIZATION
	// ============================================================
	printSectionHeader("1", "NAMESPACE INITIALIZATION", "#2196f3");
	assert(typeof window.efytSpeed === "object", "window.efytSpeed namespace is active on the window object");
	if (!window.efytSpeed) {
		console.error("[EfYT-ChSpeed] Aborting tests: window.efytSpeed is not initialized. Please ensure your script is loaded first.");
		return;
	}

	// ============================================================
	// ENVIRONMENT BACKUP (USING SCRIPT FUNCTIONS ONLY)
	// ============================================================
	const EFYT_PREFIX = "efyt_ch_speed::";
	const backupData = {};
	
	// Backup local storage configurations
	const existingKeys = [];
	for (let i = 0; i < localStorage.length; i++) {
		existingKeys.push(localStorage.key(i));
	}
	existingKeys.forEach(key => {
		if (key && key.startsWith(EFYT_PREFIX)) {
			backupData[key] = localStorage.getItem(key);
		}
	});

	// Backup active video playback rate using window.efytSpeed functions
	const originalChannelId = window.efytSpeed.fetchChannelId();
	const originalSpeed = originalChannelId 
		? (window.efytSpeed.loadChannelSpeed(originalChannelId) ?? window.efytSpeed.getEfytDefaultSpeed())
		: null;

	try {
		// ============================================================
		// 2. LOCAL STORAGE CRUD TESTS
		// ============================================================
		printSectionHeader("2", "LOCAL STORAGE CRUD TESTS", "#009688");
		const testChannel = "test_ch_diagnostics";
		window.efytSpeed.saveChannelSpeed(1.75, testChannel);
		assert(window.efytSpeed.loadChannelSpeed(testChannel) === 1.75, "saveChannelSpeed() accurately writes and loadChannelSpeed() retrieves a custom channel rate");

		// Verify direct localStorage structure
		const rawStorage = JSON.parse(localStorage.getItem(EFYT_PREFIX + testChannel));
		assert(rawStorage && rawStorage.speed === 1.75, "Data format inside localStorage matches expected JSON structure");

		// Test: clearSpeed
		window.efytSpeed.clearSpeed(testChannel);
		assert(window.efytSpeed.loadChannelSpeed(testChannel) === null, "clearSpeed() removes specified channel override");

		// Test: clearAll
		window.efytSpeed.saveChannelSpeed(1.25, "temp_ch_a");
		window.efytSpeed.saveChannelSpeed(1.5, "temp_ch_b");
		window.efytSpeed.clearAll();
		const activeKeysCount = Object.keys(localStorage).filter(k => k.startsWith(EFYT_PREFIX)).length;
		assert(activeKeysCount === 0, "clearAll() clears active overrides from localStorage");

		// ============================================================
		// 3. KEYWORD MATCHING UNIT TESTS
		// ============================================================
		printSectionHeader("3", "KEYWORD MATCHING UNIT TESTS", "#ff9800");
		const matchTests = [
			{ title: "Lorde - Royals (Official Video)", expected: true },
			{ title: "Weekly Podcast Episode #44", expected: false },
			{ title: "Chill Lofi Beats for Study/Relax", expected: true },
			{ title: "Explosion Sound Effect - SFX Compilation", expected: true },
			{ title: "How to Build a Custom Script Tutorial", expected: false }
		];

		matchTests.forEach(({ title, expected }) => {
			const isMatch = window.efytSpeed.checkTitleMatchesMusicKeyword(title);
			assert(isMatch === expected, `checkTitleMatchesMusicKeyword() classified "${title}" as ${isMatch}`);
		});

		// ============================================================
		// 4. LIVE DOM DETECTION
		// ============================================================
		printSectionHeader("4", "LIVE DOM DETECTION", "#e91e63");
		try {
			const retrievedTitle = window.efytSpeed.fetchVideoTitle();
			assert(typeof retrievedTitle === "string" && retrievedTitle.length > 0, `fetchVideoTitle() successfully extracts live title: "${retrievedTitle}"`);

			// Runs detection strictly against the real active DOM elements on the page
			const artistBadgeMatch = window.efytSpeed.checkOfficialArtistChannel();
			assert(typeof artistBadgeMatch === "boolean", `checkOfficialArtistChannel() runs on live page: ${artistBadgeMatch}`);

			const svgPathMatch = window.efytSpeed.checkArtistBadgeSvg();
			assert(typeof svgPathMatch === "boolean", `checkArtistBadgeSvg() runs on live page: ${svgPathMatch}`);
		} catch (error) {
			console.error("[EfYT-ChSpeed] An error occurred during live DOM tests:", error);
			results.failed++;
		}

		// ============================================================
		// 5. ASYNC MIX MUSIC API DETECTION
		// ============================================================
		printSectionHeader("5", "ASYNC MIX MUSIC API DETECTION", "#9c27b0");
		try {
			// Query the active video ID, or fall back to a standard music video ID if on a non-watch page
			const testVideoId = window.efytSpeed.fetchWatchVideoId() || "kJQP7kiw5Fk";
			const mixResult = await window.efytSpeed.verifyMixIsMusic(testVideoId);
			assert(
				mixResult === true || mixResult === false || mixResult === null,
				`verifyMixIsMusic() resolved diagnostic run on ID "${testVideoId}" (Result: ${mixResult})`
			);
		} catch (error) {
			console.error("[EfYT-ChSpeed] An error occurred during verifyMixIsMusic testing:", error);
			results.failed++;
		}

		// ============================================================
		// 6. DATA PORTABILITY
		// ============================================================
		printSectionHeader("6", "DATA PORTABILITY", "#607d8b");
		try {
			window.efytSpeed.saveChannelSpeed(1.5, "temp_export_ch");
			const exportObject = window.efytSpeed.exportChannelSpeeds();
			assert(exportObject && exportObject["temp_export_ch"] !== undefined, "exportChannelSpeeds() gathers valid configurations as a key-value structure");
			window.efytSpeed.clearSpeed("temp_export_ch");
		} catch (error) {
			console.error("[EfYT-ChSpeed] An error occurred during export testing:", error);
			results.failed++;
		}

		try {
			window.efytSpeed.importChannelSpeeds();
			const importBtn = document.getElementById("efyt-chspeed-import-btn");
			assert(importBtn !== null, "importChannelSpeeds() renders overlay button for choosing file");
			if (importBtn) importBtn.remove();
		} catch (error) {
			console.error("[EfYT-ChSpeed] An error occurred during import testing:", error);
			results.failed++;
		}

		// ============================================================
		// 7. SPA TRANSITION & INTEGRATION TESTS
		// ============================================================
		printSectionHeader("7", "SPA TRANSITION & INTEGRATION TESTS", "#673ab7");
		try {
			console.log("[EfYT-ChSpeed] %c[SPA Mocks] Setting up simulated DOM and window environment...", "color:#e6c229; font-weight:bold;");

			const originalGetElementById = document.getElementById;
			const originalQuerySelector = document.querySelector;
			const originalQuerySelectorAll = document.querySelectorAll;
			const originalUrl = window.location.href;

			// Define selectors matching internal script configurations
			const MOCK_SELECTORS = {
				videoElement: "video",
				watchFlexy: "ytd-watch-flexy",
				channelName: "ytd-channel-name yt-formatted-string, #owner ytd-channel-name a",
				ownerContainer: "#owner, ytd-video-owner-renderer, ytd-channel-name",
				mainWatchOwner: "ytd-watch-metadata #owner, ytd-watch-metadata ytd-video-owner-renderer, ytd-video-primary-info-renderer #owner",
				ownerPaths: "#owner path, ytd-channel-name path, ytd-video-owner-renderer path",
				artistBadges: [
					'badge-shape[aria-label="Official Artist Channel"]',
					'[aria-label="Official Artist Channel"]',
					'.badge-style-type-verified-artist',
					'badge-shape.yt-badge-shape--verified-artist',
					'badge-shape[class*="verified-artist"]',
					'.yt-badge-shape--verified-artist'
				].join(', '),
				videoTitle: "ytd-watch-metadata h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, h1.ytd-video-primary-info-renderer"
			};

			const ARTIST_BADGE_SVG_PATH = "M9.03 2.242 8.272 3H7.2A4.2 4.2 0 003 7.2v1.072l-.758.758a4.2 4.2 0 000 5.94l.758.758V16.8A4.2 4.2 0 007.2 21h1.072l.758.758a4.2 4.2 0 000 5.94 0l.758-.758H16.8a4.2 4.2 0 004.2-4.2v-1.072l.758-.758a4.2 4.2 0 000-5.94L21 8.272V7.2A4.2 4.2 0 0016.8 3h-1.072l-.758-.758a4.2 4.2 0 00-5.94 0Zm7.73 6.638a.5.5 0 01.241.427v1.743a.256.256 0 01-.386.219L14.001 9.7v4.55a2.75 2.75 0 11-2-2.646V6.888a.5.5 0 01.759-.428l4 2.42Z";

			const mockState = {
				videoId: "",
				channelId: "",
				author: "",
				title: "",
				category: "",
				playbackRate: 1.0,
				isArtist: false,
				isArtistSvg: false
			};

			const mockVideo = {
				tagName: "VIDEO",
				get playbackRate() { return mockState.playbackRate; },
				set playbackRate(v) { mockState.playbackRate = v; },
				readyState: 4,
				closest: (selector) => {
					if (selector === "#movie_player") return mockPlayer;
					return null;
				}
			};

			const mockButton = {
				click: () => {} // fallback directly sets the rate inside the script's controller logic
			};

			const mockPlayer = {
				getPlayerResponse: () => ({
					videoDetails: {
						videoId: mockState.videoId,
						channelId: mockState.channelId,
						author: mockState.author,
						title: mockState.title
					},
					microformat: {
						playerMicroformatRenderer: {
							category: mockState.category
						}
					}
				}),
				getAdState: () => 0,
				classList: {
					contains: () => false
				},
				querySelector: (selector) => {
					if (selector === "video") return mockVideo;
					return null;
				}
			};

			document.getElementById = function(id) {
				if (id === "movie_player") return mockPlayer;
				if (id === "efyt-speed-plus" || id === "efyt-speed-minus") return mockButton;
				return originalGetElementById.call(document, id);
			};

			document.querySelector = function(selector) {
				if (selector === "video" || selector === MOCK_SELECTORS.videoElement) return mockVideo;
				if (selector === MOCK_SELECTORS.watchFlexy) {
					return { getAttribute: (attr) => attr === "video-id" ? mockState.videoId : null };
				}
				if (selector === MOCK_SELECTORS.channelName) {
					return { textContent: mockState.author };
				}
				if (selector === MOCK_SELECTORS.videoTitle) {
					return { textContent: mockState.title };
				}
				if (selector === MOCK_SELECTORS.ownerContainer || selector === MOCK_SELECTORS.mainWatchOwner) {
					return { textContent: mockState.author + " Subscriber Count" };
				}
				return originalQuerySelector.call(document, selector);
			};

			document.querySelectorAll = function(selector) {
				if (selector === MOCK_SELECTORS.artistBadges) {
					if (mockState.isArtist) {
						return [{
							closest: () => ({ textContent: mockState.author + " Subscriber Count" })
						}];
					}
					return [];
				}
				if (selector === MOCK_SELECTORS.ownerPaths) {
					if (mockState.isArtistSvg) {
						return [{
							getAttribute: (attr) => attr === "d" ? ARTIST_BADGE_SVG_PATH : null,
							closest: () => ({ textContent: mockState.author + " Subscriber Count" })
						}];
					}
					return [];
				}
				return originalQuerySelectorAll.call(document, selector);
			};

			async function simulateNavigation(config) {
				mockState.videoId = config.videoId;
				mockState.channelId = config.channelId;
				mockState.author = config.author;
				mockState.title = config.title;
				mockState.category = config.category;
				mockState.isArtist = config.isArtist || false;
				mockState.isArtistSvg = config.isArtistSvg || false;
				mockState.playbackRate = config.initialPlaybackRate ?? 1.0;

				history.pushState({}, "", `/watch?v=${config.videoId}`);
				window.dispatchEvent(new CustomEvent("yt-navigate-finish"));
				
				// Yield thread execution to allow the script's polling ticks (150ms intervals) to evaluate
				await new Promise(resolve => setTimeout(resolve, 400));
			}

			// Predefined Mock Assets
			const mockMusicVideo = {
				videoId: "test_mv_vid_1",
				channelId: "ch_music_1",
				author: "Artist Channel 1",
				title: "My Pop Single (Official MV)",
				category: "Music",
				initialPlaybackRate: 1.0
			};

			const mockNormalVideo1 = {
				videoId: "test_normal_vid_1",
				channelId: "ch_normal_1",
				author: "Tech Channels",
				title: "Computing Tutorial Part 2",
				category: "Education",
				initialPlaybackRate: 1.0
			};

			const mockNormalVideo2 = {
				videoId: "test_normal_vid_2",
				channelId: "ch_normal_2",
				author: "Vlogger Squad",
				title: "Travel Vlog 2026",
				category: "People & Blogs",
				initialPlaybackRate: 1.0
			};

			// Ensure a clean starting slate inside localStorage
			window.efytSpeed.clearAll();
			const globalDefaultSpeed = window.efytSpeed.getEfytDefaultSpeed();

			// ------------------------------------------------------------
			// TEST A: Music video going to normal video and back
			// ------------------------------------------------------------
			console.log("[EfYT-ChSpeed] %c  [Test A] Transitioning: Music Video (1x) → Normal Video (Default) → Music Video (1x) ", "color:#00bcd4; font-weight:bold;");
			
			await simulateNavigation(mockMusicVideo);
			assert(mockState.playbackRate === 1.0, "M1 (Music Video) successfully resolved to 1.0x (music override)");

			await simulateNavigation(mockNormalVideo1);
			assert(mockState.playbackRate === globalDefaultSpeed, `N1 (Normal Video) accurately applied global default: ${globalDefaultSpeed}x`);

			await simulateNavigation(mockMusicVideo);
			assert(mockState.playbackRate === 1.0, "M1 (Returned) restored back to 1.0x (music override)");

			// ------------------------------------------------------------
			// TEST B: Normal video with 1.5x speed going to normal video and back
			// ------------------------------------------------------------
			console.log("[EfYT-ChSpeed] %c  [Test B] Transitioning: Normal Video (1.5x Override) → Normal Video (Default) → Normal Video (1.5x Override) ", "color:#00bcd4; font-weight:bold;");

			// Configure a persistent 1.5x override for the first normal channel
			window.efytSpeed.saveChannelSpeed(1.5, mockNormalVideo1.channelId);

			await simulateNavigation(mockNormalVideo1);
			assert(mockState.playbackRate === 1.5, "N1 (Custom Normal) resolved to its designated 1.5x configuration");

			await simulateNavigation(mockNormalVideo2);
			assert(mockState.playbackRate === globalDefaultSpeed, `N2 (Standard Normal) successfully reverted back to default: ${globalDefaultSpeed}x`);

			await simulateNavigation(mockNormalVideo1);
			assert(mockState.playbackRate === 1.5, "N1 (Returned Custom Normal) correctly re-applied its 1.5x override");

			// ------------------------------------------------------------
			// TEST C: Music video going to 1.5x speed and back
			// ------------------------------------------------------------
			console.log("[EfYT-ChSpeed] %c  [Test C] Transitioning: Music Video (1x) → Normal Video (1.5x Override) → Music Video (1x) ", "color:#00bcd4; font-weight:bold;");

			await simulateNavigation(mockMusicVideo);
			assert(mockState.playbackRate === 1.0, "M1 (Music Video) initialized at 1.0x");

			await simulateNavigation(mockNormalVideo1);
			assert(mockState.playbackRate === 1.5, "Transitioned to N1 (Custom Normal): successfully speed shifted to 1.5x override");

			await simulateNavigation(mockMusicVideo);
			assert(mockState.playbackRate === 1.0, "Transitioned back to M1 (Music Video): successfully restored to 1.0x");

			// Restore original environment
			document.getElementById = originalGetElementById;
			document.querySelector = originalQuerySelector;
			document.querySelectorAll = originalQuerySelectorAll;
			history.replaceState({}, "", originalUrl);
			console.log("[EfYT-ChSpeed] %c[SPA Mocks] Restored native DOM functions and browser URL.", "color:#e6c229; font-style:italic;");

		} catch (error) {
			console.error("[EfYT-ChSpeed] An error occurred during SPA transition testing:", error);
			results.failed++;
		}

	} catch (error) {
		console.error("[EfYT-ChSpeed] An unexpected error occurred during test suite execution:", error);
		results.failed++;
	} finally {
		// ============================================================
		// CLEANUP & ENVIRONMENT RESTORATION (USING HELPER FUNCTIONS)
		// ============================================================
		
		// 1. Reset physical playback rate using the helper function first
		if (originalChannelId && originalSpeed !== null) {
			window.efytSpeed.saveChannelSpeed(originalSpeed, originalChannelId);
			console.log(`[EfYT-ChSpeed] %c[Backup] Restored active channel speed to ${originalSpeed}x via saveChannelSpeed().`, "color:#aaa; font-style:italic;");
		}

		// 2. Remove any transient configurations generated during active test assertions
		const currentKeys = [];
		for (let i = 0; i < localStorage.length; i++) {
			currentKeys.push(localStorage.key(i));
		}
		currentKeys.forEach(key => {
			if (key && key.startsWith(EFYT_PREFIX)) {
				localStorage.removeItem(key);
			}
		});

		// 3. Re-inject original localStorage speed data configurations
		for (const [key, value] of Object.entries(backupData)) {
			localStorage.setItem(key, value);
		}
		console.log("[EfYT-ChSpeed] %c[Backup] Restored existing channel speed configurations.", "color:#aaa; font-style:italic;");

		// 4. Trigger manual refresh to ensure the page's runtime state matches the restored data
		window.efytSpeed.refresh();
		console.log("[EfYT-ChSpeed] %c[Refresh] Triggered manual configuration refresh.", "color:#aaa; font-style:italic;");
	}

	// ============================================================
	// SUMMARY
	// ============================================================
	const summaryColor = results.failed === 0 ? "#0f9d58" : "#db4437";
	console.log("[EfYT-ChSpeed] "); // spacing line that survives filtering
	console.log(`[EfYT-ChSpeed] %c============================================================`, `color: ${summaryColor}; font-weight: bold;`);
	console.log(`[EfYT-ChSpeed] %cTEST SUITE COMPLETED | Passed: ${results.passed} | Failed: ${results.failed}`, `color: ${summaryColor}; font-weight: bold; font-size: 13px;`);
	console.log(`[EfYT-ChSpeed] %c============================================================`, `color: ${summaryColor}; font-weight: bold;`);

	// Live diagnostics on current page
	console.log("[EfYT-ChSpeed] %c[Live Environment Context]", "color:#fff; font-weight:bold; text-decoration: underline;");
	console.log("[EfYT-ChSpeed]   Current Watch Video ID :", window.efytSpeed.fetchWatchVideoId() || "(Not on a video page)");
	console.log("[EfYT-ChSpeed]   Current Channel ID     :", window.efytSpeed.fetchChannelId() || "(Not on a video page)");
	console.log("[EfYT-ChSpeed]   Is Music Detected      :", window.efytSpeed.isMusicCategory());
})();