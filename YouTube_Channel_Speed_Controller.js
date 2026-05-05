// ============================================================
// Enhancer for YouTube™ — Remember Speed Per Channel (v9)
// Paste this into: EfYT Options → Custom Script
// ============================================================

(function () {
	"use strict";

	const APPLY_DELAY_MS = 1500;
	const EFYT_KEY = "enhancer-for-youtube";
	const CH_PREFIX = "efyt_ch_speed::";
	let suppressSave = false;

	// -----------------------------------------------------------
	// Helpers
	// -----------------------------------------------------------

	function getEfytDefaultSpeed() {
		try {
			const s = JSON.parse(localStorage.getItem(EFYT_KEY));
			if (s?.speed > 0) return s.speed;
		} catch (_) {}
		return 1;
	}

	function getChannelId() {
		const link = document.querySelector("ytd-channel-name a") || document.querySelector("#channel-name a") || document.querySelector("yt-formatted-string#channel-name a");
		try {
			return link && new URL(link.href).pathname.toLowerCase();
		} catch (_) {}
		return null;
	}

	function loadChannelSpeed(id) {
		const n = parseFloat(localStorage.getItem(CH_PREFIX + id));
		return !isNaN(n) && n > 0 ? n : null;
	}

	function saveChannelSpeed(id, speed) {
		const def = getEfytDefaultSpeed();
		if (Math.abs(speed - def) < 0.001) {
			localStorage.removeItem(CH_PREFIX + id);
			console.log(`[EfYT-ChSpeed] Cleared override for ${id} (matches default ${def}x)`);
		} else {
			localStorage.setItem(CH_PREFIX + id, String(speed));
			console.log(`[EfYT-ChSpeed] Saved ${speed}x for ${id}`);
		}
	}

	// -----------------------------------------------------------
	// Step EfYT to target speed using its own +/- buttons
	// -----------------------------------------------------------

	function stepToSpeed(targetSpeed) {
		const video = document.querySelector("video");
		const plus = document.getElementById("efyt-speed-plus");
		const minus = document.getElementById("efyt-speed-minus");
		if (!video || !plus || !minus) return;
		if (Math.abs(video.playbackRate - targetSpeed) < 0.001) return;

		const btn = targetSpeed > video.playbackRate ? plus : minus;
		const before = video.playbackRate;
		btn.click();
		const step = Math.abs(video.playbackRate - before);
		if (!step) return;

		const remaining = Math.round((targetSpeed - video.playbackRate) / step);
		const dir = remaining > 0 ? plus : minus;
		for (let i = 0; i < Math.abs(remaining); i++) dir.click();
		console.log(`[EfYT-ChSpeed] Stepped to ${video.playbackRate}x`);
	}

	// -----------------------------------------------------------
	// Tooltip hover — show live speed in EfYT's own tooltip
	// -----------------------------------------------------------

	function onSpeedHover() {
		setTimeout(() => {
			const video = document.querySelector("video");
			const tooltip = document.querySelector(".ytp-efyt-tooltip .ytp-tooltip-text");
			if (video && tooltip) tooltip.textContent = `Speed (${video.playbackRate}x)`;
		}, 50);
	}

	// -----------------------------------------------------------
	// Main: run on every YouTube navigation
	// -----------------------------------------------------------

	let video = null;

	function onVideoNavigation() {
		setTimeout(() => {
			const newVideo = document.querySelector("video");
			if (!newVideo) return;

			// Re-attach rate listener only if the video element changed
			if (newVideo !== video) {
				video?.removeEventListener("ratechange", onRateChange);
				newVideo.addEventListener("ratechange", onRateChange);
				video = newVideo;
			}

			// Re-attach tooltip hover (safe to call repeatedly)
			const btn = document.getElementById("efyt-speed");
			if (btn) {
				btn.removeEventListener("mouseenter", onSpeedHover);
				btn.addEventListener("mouseenter", onSpeedHover);
			}

			const id = getChannelId();
			const saved = id && loadChannelSpeed(id);
			if (!saved) return;

			console.log(`[EfYT-ChSpeed] Restoring ${saved}x for ${id}`);
			suppressSave = true;
			stepToSpeed(saved);
			setTimeout(() => {
				suppressSave = false;
			}, 500);
		}, APPLY_DELAY_MS);
	}

	function onRateChange() {
		if (suppressSave) return;
		const id = getChannelId();
		if (id) saveChannelSpeed(id, video.playbackRate);
	}

	window.addEventListener("yt-navigate-finish", onVideoNavigation);
	document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", onVideoNavigation) : onVideoNavigation();

	// -----------------------------------------------------------
	// Export / Import — call from DevTools Console on YouTube
	// -----------------------------------------------------------

	window.efytSpeedExport = function () {
		const out = {};
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k?.startsWith(CH_PREFIX)) out[k.slice(CH_PREFIX.length)] = parseFloat(localStorage.getItem(k));
		}
		const json = JSON.stringify(out, null, 2);
		console.log("%c[EfYT-ChSpeed] Copy the JSON below:", "color:#aaa;font-style:italic");
		console.log("%c----------------------------------------", "color:#444");
		console.log(json);
		console.log("%c----------------------------------------", "color:#444");
		return out;
	};

	window.efytSpeedImport = function (data) {
		if (typeof data === "string") {
			try {
				data = JSON.parse(data);
			} catch (_) {
				console.error("[EfYT-ChSpeed] Import failed — invalid JSON.");
				return;
			}
		}
		let count = 0;
		for (const [ch, sp] of Object.entries(data)) {
			const n = parseFloat(sp);
			if (!isNaN(n) && n > 0) {
				localStorage.setItem(CH_PREFIX + ch, String(n));
				count++;
			}
		}
		console.log(`[EfYT-ChSpeed] Imported ${count} channel(s).`);
	};

	console.log('%c[EfYT-ChSpeed] Active.\n%c  Export: efytSpeedExport()\n%c  Import: efytSpeedImport({"/@channel": 1.5})', "color:#fff;font-weight:bold", "color:#aaa", "color:#aaa");
})();
