import type { PermissionRequest } from "@opencode/client/promise"
import type { Accessor } from "solid-js"
import type { SessionRequestModel } from "../requests/model"

export type PermissionAgent = { id: string; name: string; remit?: string }

export function createSessionComposerRegionController(input: {
  state: SessionRequestModel
  parentID: Accessor<string | undefined>
  centered: Accessor<boolean>
  onResponseSubmit: () => void
  openParent: () => void
  setPromptRef: (el: HTMLDivElement) => void
  setDockRef: (el: HTMLDivElement) => void
  permissionAgent?: Accessor<PermissionAgent | undefined>
  permissionAgents?: Accessor<readonly PermissionAgent[]>
  routePermission?: (agent: string) => void
  reviewPermission?: (request: PermissionRequest, signal: AbortSignal) => Promise<string>
}) {
  return {
    state: input.state,
    centered: input.centered,
    onResponseSubmit: input.onResponseSubmit,
    openParent: input.openParent,
    setPromptRef: input.setPromptRef,
    setDockRef: input.setDockRef,
    parentID: input.parentID,
    permissionAgent: input.permissionAgent,
    permissionAgents: input.permissionAgents,
    routePermission: input.routePermission,
    reviewPermission: input.reviewPermission,
    child: () => !!input.parentID(),
    showComposer: () => !input.state.blocked() || !!input.parentID(),
  }
}

export type SessionComposerRegionController = ReturnType<typeof createSessionComposerRegionController>
