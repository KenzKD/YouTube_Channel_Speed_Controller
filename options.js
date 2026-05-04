document.getElementById("save").addEventListener("click", async () => {
  const channel = document.getElementById("channel").value.trim();
  const speed = parseFloat(document.getElementById("speed").value);
  if (!channel || isNaN(speed)) return;

  const settings = await browser.storage.local.get("channelSpeeds");
  const channelSpeeds = settings.channelSpeeds || {};
  channelSpeeds[channel] = speed;
  await browser.storage.local.set({ channelSpeeds });
  alert("Saved!");
});

document.getElementById("export").addEventListener("click", async () => {
  const settings = await browser.storage.local.get("channelSpeeds");
  const json = JSON.stringify(settings.channelSpeeds || {}, null, 2);
  document.getElementById("output").textContent = json;
});

document.getElementById("import").addEventListener("click", async () => {
  const file = document.getElementById("importFile").files[0];
  if (!file) return;
  const text = await file.text();
  const imported = JSON.parse(text);
  await browser.storage.local.set({ channelSpeeds: imported });
  alert("Imported!");
});
