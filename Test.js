(async function runEfytTestSuite() {
	console.log("%c[EfYT-ChSpeed Test Suite] Starting diagnostic and logic tests...", "color:#8ab4f8; font-weight:bold;");
	
	const results = { passed: 0, failed: 0 };

	function assert(condition, message) {
		if (condition) {
			console.log(`%c[PASS] %c${message}`, "color:#0f9d58; font-weight:bold;", "color:inherit;");
			results.passed++;
		} else {
			console.error(`%c[FAIL] %c${message}`, "color:#db4437; font-weight:bold;", "color:inherit;");
			results.failed++;
		}
	}

	// ============================================================
	// 1. NAMESPACE INITIALIZATION
	// ============================================================
	assert(typeof window.efytSpeed === "object", "window.efytSpeed namespace is active on the window object");
	if (!window.efytSpeed) {
		console.error("Aborting tests: window.efytSpeed is not initialized. Please ensure your script is loaded first.");
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
	const originalChannelId = window.efytSpeed.getChannelId();
	const originalSpeed = originalChannelId 
		? (window.efytSpeed.getSpeed(originalChannelId) ?? window.efytSpeed.getDefaultSpeed())
		: null;

	try {
		// ============================================================
		// 2. LOCAL STORAGE CRUD TESTS
		// ============================================================
		const testChannel = "test_ch_diagnostics";
		window.efytSpeed.setSpeed(1.75, testChannel);
		assert(window.efytSpeed.getSpeed(testChannel) === 1.75, "setSpeed() accurately writes and getSpeed() retrieves a custom channel rate");

		// Verify direct localStorage structure
		const rawStorage = JSON.parse(localStorage.getItem(EFYT_PREFIX + testChannel));
		assert(rawStorage && rawStorage.speed === 1.75, "Data format inside localStorage matches expected JSON structure");

		// Test: clearSpeed
		window.efytSpeed.clearSpeed(testChannel);
		assert(window.efytSpeed.getSpeed(testChannel) === null, "clearSpeed() removes specified channel override");

		// Test: clearAll
		window.efytSpeed.setSpeed(1.25, "temp_ch_a");
		window.efytSpeed.setSpeed(1.5, "temp_ch_b");
		window.efytSpeed.clearAll();
		const activeKeysCount = Object.keys(localStorage).filter(k => k.startsWith(EFYT_PREFIX)).length;
		assert(activeKeysCount === 0, "clearAll() clears active overrides from localStorage");

		// ============================================================
		// 3. KEYWORD MATCHING UNIT TESTS
		// ============================================================
		const matchTests = [
			{ title: "Lorde - Royals (Official Video)", expected: true },
			{ title: "Weekly Podcast Episode #44", expected: false },
			{ title: "Chill Lofi Beats for Study/Relax", expected: true },
			{ title: "Explosion Sound Effect - SFX Compilation", expected: true },
			{ title: "How to Build a Custom Script Tutorial", expected: false }
		];

		matchTests.forEach(({ title, expected }) => {
			const isMatch = window.efytSpeed.titleMatchesMusicKeyword(title);
			assert(isMatch === expected, `titleMatchesMusicKeyword() classified "${title}" as ${isMatch}`);
		});

		// ============================================================
		// 4. LIVE DOM DETECTION
		// ============================================================
		try {
			const retrievedTitle = window.efytSpeed.getVideoTitle();
			assert(typeof retrievedTitle === "string" && retrievedTitle.length > 0, `getVideoTitle() successfully extracts live title: "${retrievedTitle}"`);

			// Runs detection strictly against the real active DOM elements on the page
			const artistBadgeMatch = window.efytSpeed.isOfficialArtistChannel();
			assert(typeof artistBadgeMatch === "boolean", `isOfficialArtistChannel() runs on live page: ${artistBadgeMatch}`);

			const svgPathMatch = window.efytSpeed.hasArtistBadgeSvg();
			assert(typeof svgPathMatch === "boolean", `hasArtistBadgeSvg() runs on live page: ${svgPathMatch}`);
		} catch (error) {
			console.error("An error occurred during live DOM tests:", error);
			results.failed++;
		}

		// ============================================================
		// 5. ASYNC MIX MUSIC API DETECTION
		// ============================================================
		try {
			// Query the active video ID, or fall back to a standard music video ID if on a non-watch page
			const testVideoId = window.efytSpeed.getWatchVideoId() || "kJQP7kiw5Fk";
			const mixResult = await window.efytSpeed.checkMixIsMusic(testVideoId);
			assert(
				mixResult === true || mixResult === false || mixResult === null,
				`checkMixIsMusic() resolved diagnostic run on ID "${testVideoId}" (Result: ${mixResult})`
			);
		} catch (error) {
			console.error("An error occurred during checkMixIsMusic testing:", error);
			results.failed++;
		}

		// ============================================================
		// 6. DATA PORTABILITY
		// ============================================================
		try {
			window.efytSpeed.setSpeed(1.5, "temp_export_ch");
			const exportObject = window.efytSpeed.export();
			assert(exportObject && exportObject["temp_export_ch"] !== undefined, "export() gathers valid configurations as a key-value structure");
			window.efytSpeed.clearSpeed("temp_export_ch");
		} catch (error) {
			console.error("An error occurred during export testing:", error);
			results.failed++;
		}

		try {
			window.efytSpeed.import();
			const importBtn = document.getElementById("efyt-chspeed-import-btn");
			assert(importBtn !== null, "import() renders overlay button for choosing file");
			if (importBtn) importBtn.remove();
		} catch (error) {
			console.error("An error occurred during import testing:", error);
			results.failed++;
		}

	} catch (error) {
		console.error("An unexpected error occurred during test suite execution:", error);
		results.failed++;
	} finally {
		// ============================================================
		// CLEANUP & ENVIRONMENT RESTORATION (USING HELPER FUNCTIONS)
		// ============================================================
		
		// 1. Reset physical playback rate using the helper function first
		if (originalChannelId && originalSpeed !== null) {
			window.efytSpeed.setSpeed(originalSpeed, originalChannelId);
			console.log(`%c[Backup] Restored active channel speed to ${originalSpeed}x via setSpeed().`, "color:#aaa; font-style:italic;");
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
		console.log("%c[Backup] Restored existing channel speed configurations.", "color:#aaa; font-style:italic;");

		// 4. Trigger manual refresh to ensure the page's runtime state matches the restored data
		window.efytSpeed.refresh();
		console.log("%c[Refresh] Triggered manual configuration refresh.", "color:#aaa; font-style:italic;");
	}

	// ============================================================
	// SUMMARY
	// ============================================================
	console.log(
		`%c[EfYT-ChSpeed Test Suite] Finished. Passed: ${results.passed} | Failed: ${results.failed}`,
		`color: ${results.failed === 0 ? "#0f9d58" : "#db4437"}; font-weight: bold;`
	);

	// Live diagnostics on current page
	console.log("%c[Live Environment Context]", "color:#fff; font-weight:bold; text-decoration: underline;");
	console.log("  Current Watch Video ID :", window.efytSpeed.getWatchVideoId() || "(Not on a video page)");
	console.log("  Current Channel ID     :", window.efytSpeed.getChannelId() || "(Not on a video page)");
	console.log("  Is Music Detected      :", window.efytSpeed.isMusicCategory());
})();