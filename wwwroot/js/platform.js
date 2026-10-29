/** Где запущен фронт: сайт (Django) или Android-оболочка (WebView). */

export function isMobileApp() {
  return document.body.classList.contains("is-mobile-app");
}
