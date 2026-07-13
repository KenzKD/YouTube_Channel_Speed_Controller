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
	// 2. LOCAL STORAGE CRUD BACKUP & RESTORE SAFETY
	// ============================================================
	const EFYT_PREFIX = "efyt_ch_speed::";
	const backupData = {};
	const existingKeys = [];
	
	for (let i = 0; i < localStorage.length; i++) {
		existingKeys.push(localStorage.key(i));
	}
	existingKeys.forEach(key => {
		if (key && key.startsWith(EFYT_PREFIX)) {
			backupData[key] = localStorage.getItem(key);
		}
	});

	try {
		// Test: setSpeed and getSpeed
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

	} catch (error) {
		console.error("An error occurred during local storage tests:", error);
		results.failed++;
	} finally {
		// Restore user's previous data
		for (const [key, value] of Object.entries(backupData)) {
			localStorage.setItem(key, value);
		}
		console.log("%c[Backup] Restored existing channel speed configurations.", "color:#aaa; font-style:italic;");
	}

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
	// 4. DOM SELECTION & SVG DETECTION (SANDBOXED)
	// ============================================================
	const sandbox = document.createElement("div");
	sandbox.id = "efyt-diagnostic-sandbox";
	document.body.appendChild(sandbox);

	try {
		// Setup Simulated DOM matching selectors inside the sandbox
		sandbox.innerHTML = `
			<div id="title">
				<h1 class="ytd-video-primary-info-renderer">
					<yt-formatted-string>Mocked Video Title - Official Audio</yt-formatted-string>
				</h1>
			</div>
			<div id="owner">
				<badge-shape aria-label="Official Artist Channel"></badge-shape>
				<svg>
					<path d="M9.03 2.242 8.272 3H7.2A4.2 4.2 0 003 7.2v1.072l-.758.758a4.2 4.2 0 000 5.94l.758.758V16.8A4.2 4.2 0 007.2 21h1.072l.758.758a4.2 4.2 0 005.94 0l.758-.758H16.8a4.2 4.2 0 004.2-4.2v-1.072l.758-.758a4.2 4.2 0 000-5.94L21 8.272V7.2A4.2 4.2 0 0016.8 3h-1.072l-.758-.758a4.2 4.2 0 00-5.94 0Zm7.73 6.638a.5.5 0 01.241.427v1.743a.256.256 0 01-.386.219L14.001 9.7v4.55a2.75 2.75 0 11-2-2.646V6.888a.5.5 0 01.759-.428l4 2.42Z"></path>
				</svg>
			</div>
		`;

		// Check if our title extraction handles target selector
		const retrievedTitle = window.efytSpeed.getVideoTitle();
		assert(retrievedTitle.includes("Mocked Video Title"), `getVideoTitle() successfully extracts title: "${retrievedTitle}"`);

		// Check Official Artist Channel badge recognition
		const artistBadgeMatch = window.efytSpeed.isOfficialArtistChannel();
		assert(artistBadgeMatch === true, "isOfficialArtistChannel() detects standard Official Artist badge shape");

		// Check Artist SVG path match
		const svgPathMatch = window.efytSpeed.hasArtistBadgeSvg();
		assert(svgPathMatch === true, "hasArtistBadgeSvg() detects specific Artist Badge icon vector path");

	} catch (error) {
		console.error("An error occurred during DOM sandbox tests:", error);
		results.failed++;
	} finally {
		sandbox.remove();
	}

	// ============================================================
	// 5. DATA PORTABILITY
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