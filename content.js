const DEFAULT_SPEED = 2.0;

const videoEl = () => document.querySelector("video");
const channelName = () => document.querySelector("ytd-channel-name a")?.textContent.trim();

async function setSpeed(speed, label) {
  const video = videoEl();
  if (!video) return;

  // Apply speed once
  video.playbackRate = speed;

  // Update label
  if (label) label.textContent = speed.toFixed(2) + "x";

  // Save only if not default
  const ch = channelName();
  if (ch) {
    const { channelSpeeds = {} } = await browser.storage.local.get("channelSpeeds");
    if (speed === DEFAULT_SPEED) delete channelSpeeds[ch];
    else channelSpeeds[ch] = speed;
    await browser.storage.local.set({ channelSpeeds });
  }
}

async function createSpeedControls() {
  if (document.getElementById("yt-speed-controls")) return;
  const controls = document.querySelector(".ytp-right-controls");
  if (!controls || !videoEl()) return;

  const container = Object.assign(document.createElement("div"), {
    id: "yt-speed-controls",
    style: "display:flex;align-items:center;gap:15px;color:white;cursor:pointer;"
  });

  const minusBtn = Object.assign(document.createElement("span"), { textContent: "-", style: "font-size:18px" });
  const plusBtn  = Object.assign(document.createElement("span"), { textContent: "+", style: "font-size:18px" });
  const label    = Object.assign(document.createElement("span"), { textContent: "…", style: "font-size:14px" });

  [minusBtn, label, plusBtn].forEach(el => container.appendChild(el));
  controls.insertBefore(container, controls.firstChild);

  // Decide speed but don’t apply yet
  let speed = DEFAULT_SPEED;
  const ch = channelName();
  if (ch) {
    const { channelSpeeds = {} } = await browser.storage.local.get("channelSpeeds");
    if (channelSpeeds[ch]) speed = channelSpeeds[ch];
  }

  // Apply speed
  setSpeed(speed, label);

  const changeSpeed = (delta) => {
    const newSpeed = Math.min(Math.max(videoEl().playbackRate + delta, 0.25), 4);
    setSpeed(newSpeed, label);
  };

  minusBtn.onclick = () => changeSpeed(-0.25);
  plusBtn.onclick  = () => changeSpeed(0.25);

  container.addEventListener("wheel", (e) => {
    e.preventDefault(); e.stopPropagation();
    changeSpeed(e.deltaY < 0 ? 0.25 : -0.25);
  }, { passive: false });

  // setSpeed(videoEl().playbackRate, label);
}

// Run once video loads
const videoObserver = new MutationObserver(() => {
  const video = document.querySelector("video");
  if (video) {
    createSpeedControls();
    videoObserver.disconnect();
  }
});
videoObserver.observe(document.body, { childList: true, subtree: true });