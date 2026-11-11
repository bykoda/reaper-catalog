"use strict";

const miniApp = (() => {
  const webApp = window.Telegram?.WebApp;
  const active = Boolean(webApp?.platform && webApp.platform !== "unknown");
  const hasBackButton = active && webApp.isVersionAtLeast?.("6.1");
  const themeKey = "reaper-library-theme-v1";
  const root = document.documentElement;
  let chosenTheme;

  try {
    chosenTheme = localStorage.getItem(themeKey);
  } catch {
    // Some webviews block local storage.
  }

  function setTheme(theme, remember = false) {
    root.dataset.theme = theme;
    if (remember) {
      chosenTheme = theme;
      try {
        localStorage.setItem(themeKey, theme);
      } catch {
        // Keep the choice for this visit.
      }
    }
    const button = document.getElementById("theme");
    button.textContent = theme === "dark" ? "☀ Светлая тема" : "☾ Тёмная тема";
    button.setAttribute("aria-pressed", String(theme === "dark"));

    if (active && webApp.isVersionAtLeast?.("6.1")) {
      const paper = getComputedStyle(root).getPropertyValue("--paper").trim();
      const surface = getComputedStyle(root)
        .getPropertyValue("--surface")
        .trim();
      webApp.setBackgroundColor(paper);
      if (webApp.isVersionAtLeast("6.9")) webApp.setHeaderColor(surface);
    }
  }

  function applyTheme() {
    const fallback =
      active && webApp.colorScheme === "light" ? "light" : "dark";
    setTheme(
      chosenTheme === "light" || chosenTheme === "dark"
        ? chosenTheme
        : fallback,
    );
  }

  function openDialog(dialog) {
    dialog.showModal();
    if (hasBackButton) webApp.BackButton.show();
  }

  function init() {
    root.toggleAttribute("data-telegram", active);
    applyTheme();
    document.getElementById("theme").addEventListener("click", () => {
      setTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
    });
    if (!active) return;

    document.getElementById("resultHint").textContent =
      "Ссылки открываются вне каталога ↗";
    webApp.onEvent("themeChanged", applyTheme);
    if (hasBackButton) {
      webApp.BackButton.onClick(() =>
        document.querySelector("dialog[open]")?.close(),
      );
      for (const dialog of document.querySelectorAll("dialog")) {
        dialog.addEventListener("close", () => {
          if (!document.querySelector("dialog[open]")) webApp.BackButton.hide();
        });
      }
    }
    document.addEventListener("click", (event) => {
      const link = event.target.closest('a[target="_blank"]');
      if (
        !link ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      const url = new URL(link.href);
      if (url.protocol !== "https:" && url.protocol !== "http:") return;
      try {
        if (url.origin === "https://t.me") webApp.openTelegramLink(url.href);
        else webApp.openLink(url.href);
        event.preventDefault();
      } catch {
        // Let the browser open the link if the client rejects the request.
      }
    });
    webApp.ready();
    webApp.expand();
  }

  return { active, init, openDialog };
})();
