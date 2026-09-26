// Sample Community Plugin
api.on("dice:roll", (data) => {
  if (data.total === 20 || data.isCritical) {
    api.notifications.toast("🌟 NATURAL 20 rolled by " + (data.roller || "Player") + "!");
  }
});
api.on("token:move", (data) => {
  // Monitored token movements
});
