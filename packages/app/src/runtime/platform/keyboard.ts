import { onCleanup, onMount } from "solid-js"

// Keep the app inside the visible part of a phone screen while a software keyboard is open. Browsers that honour
// `interactive-widget=resizes-content` resize the layout viewport themselves; the others resize only the visual
// viewport, which would leave the composer under the keyboard.
const keyboardInset = 120

export function KeyboardInsets() {
  onMount(() => {
    const viewport = window.visualViewport

    if (!viewport) return
    const root = document.documentElement

    const sync = () => {
      const active = document.activeElement

      const editing =
        active instanceof HTMLElement &&
        (active.isContentEditable || active.matches("input:not([readonly]), textarea:not([readonly])"))

      // Firefox can report a stale visual viewport until the next frame, so use the smaller value. Browsers that
      // resize the layout viewport report the same height for both and need no adjustment. Ignore pinch zoom.
      const height = Math.min(window.innerHeight, viewport.height)
      const keyboard = editing && viewport.scale <= 1.01 && window.innerHeight - height > keyboardInset

      root.toggleAttribute("data-keyboard", keyboard)

      if (!keyboard) {
        root.style.removeProperty("--visual-viewport-height")
        root.style.removeProperty("--safe-area-inset-bottom")

        return
      }

      root.style.setProperty("--visual-viewport-height", `${height}px`)
      root.style.setProperty("--safe-area-inset-bottom", "0px")
    }

    sync()
    viewport.addEventListener("resize", sync)
    window.addEventListener("resize", sync)
    document.addEventListener("focusin", sync)
    document.addEventListener("focusout", sync)
    onCleanup(() => {
      viewport.removeEventListener("resize", sync)
      window.removeEventListener("resize", sync)
      document.removeEventListener("focusin", sync)
      document.removeEventListener("focusout", sync)
      root.removeAttribute("data-keyboard")
      root.style.removeProperty("--visual-viewport-height")
      root.style.removeProperty("--safe-area-inset-bottom")
    })
  })

  return null
}
