const DEFAULT_SPEED = 1.0;

function applySpeed(speed) {
  const video = document.querySelector("video");
  if (video) {
    video.playbackRate = speed;
  }
}

function getChannelName() {
  const el = document.querySelector("ytd-channel-name a");
  return el ? el.textContent.trim() : null;
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg.action === "setSpeed") {
    applySpeed(msg.speed);
  }
});

// Observe channel changes
const observer = new MutationObserver(() => {
  const channel = getChannelName();
  if (channel) {
    browser.runtime.sendMessage({ action: "channelDetected", channel });
  }
});
observer.observe(document.body, { childList: true, subtree: true });

// 🖼️ Create UI overlay
async function createSpeedControls() {
  if (document.getElementById("yt-speed-controls")) return;

  const controls = document.querySelector(".ytp-right-controls");
  if (!controls) return;

  const container = document.createElement("div");
  container.id = "yt-speed-controls";
  container.style.display = "flex";
  container.style.alignItems = "center";
  container.style.gap = "15px";
  container.style.color = "white";
  container.style.cursor = "pointer";

  const minusBtn = document.createElement("span");
  minusBtn.textContent = "−";
  minusBtn.style.fontSize = "18px";

  const plusBtn = document.createElement("span");
  plusBtn.textContent = "+";
  plusBtn.style.fontSize = "18px";

  const label = document.createElement("span");
  label.textContent = "…"; // temporary placeholder
  label.style.fontSize = "14px";

  container.appendChild(minusBtn);
  container.appendChild(label);
  container.appendChild(plusBtn);

  controls.insertBefore(container, controls.firstChild);

  const video = document.querySelector("video");

  function updateLabel() {
    label.textContent = video.playbackRate.toFixed(2) + "x";
  }

    // Initial load of saved speed
  const channel = getChannelName();
  if (channel) {
    const settings = await browser.storage.local.get("channelSpeeds");
    const channelSpeeds = settings.channelSpeeds || {};
    if (channelSpeeds[channel]) {
      video.playbackRate = channelSpeeds[channel];
    }
  }
    
    setTimeout(async () => updateLabel(), 1000);

  // Button events
  minusBtn.addEventListener("click", async () => {
    video.playbackRate = Math.max(video.playbackRate - 0.25, 0.25);
    updateLabel();
    saveSpeed(video.playbackRate);
  });

  plusBtn.addEventListener("click", async () => {
    video.playbackRate = Math.min(video.playbackRate + 0.25, 4);
    updateLabel();
    saveSpeed(video.playbackRate);
  });

  // Scroll interaction
  container.addEventListener("wheel", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const step = 0.25;
    if (e.deltaY < 0) {
      video.playbackRate = Math.min(video.playbackRate + step, 4);
    } else {
      video.playbackRate = Math.max(video.playbackRate - step, 0.25);
    }
    updateLabel();
    saveSpeed(video.playbackRate);
  }, { passive: false });
}

function saveSpeed(speed) {
  const channel = getChannelName();
  if (channel) {
    browser.storage.local.get("channelSpeeds").then((settings) => {
      const channelSpeeds = settings.channelSpeeds || {};
      channelSpeeds[channel] = speed;
      browser.storage.local.set({ channelSpeeds });
    });
  }
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