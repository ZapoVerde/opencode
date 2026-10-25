/**
 * Opens an app-relative path in a new tab. Installed windows and some mobile
 * browsers silently drop `window.open`, so a blocked window falls back to
 * same-tab navigation instead of doing nothing.
 */
export function openPath(path: string) {
  const url = new URL(path, window.location.origin).href
  const opened = window.open(url, "_blank")

  if (!opened) {
    window.location.assign(url)

    return
  }

  opened.opener = null
}
