browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.action === "channelDetected") {
    const { channel } = msg;
    const settings = await browser.storage.local.get("channelSpeeds");
    const channelSpeeds = settings.channelSpeeds || {};
    if (channelSpeeds[channel]) {
      browser.tabs.sendMessage(sender.tab.id, {
        action: "setSpeed",
        speed: channelSpeeds[channel]
      });
    }
  }
});
