function pushVault(json) {
  try {
    if (typeof VoidPrismAndroid !== "undefined" && VoidPrismAndroid?.saveVault) {
      VoidPrismAndroid.saveVault(typeof json === "string" ? json : JSON.stringify(json));
    }
  } catch {
    /* native bridge optional (browser) */
  }
}

export const bridge = {
  pushVault,
  onError(message) {
    console.warn("[VoidPrism]", message);
  },
};
