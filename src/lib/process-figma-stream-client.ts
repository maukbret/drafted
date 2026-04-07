import { toast } from 'sonner'

export class ProcessFigmaStreamError extends Error {
  readonly toastAlreadyShown: boolean

  constructor(message: string, toastAlreadyShown: boolean) {
    super(message)
    this.name = 'ProcessFigmaStreamError'
    this.toastAlreadyShown = toastAlreadyShown
  }
}

export type ProcessFigmaStreamEvent =
  | { type: 'progress'; message?: string }
  | { type: 'warning'; message?: string }
  | { type: 'error'; message?: string; code?: string; retryAt?: string; upgradeUrl?: string }
  | { type: 'done' }

function showStreamErrorToast(data: Record<string, unknown>) {
  const message = typeof data?.message === 'string' ? data.message : 'An error occurred'

  if (data?.code === 'figma_rate_limited') {
    const description =
      typeof data?.retryAt === 'string'
        ? `Try again after ${new Date(data.retryAt).toLocaleString()}.`
        : undefined
    const upgradeUrl = typeof data?.upgradeUrl === 'string' ? data.upgradeUrl : ''

    toast.error(message, {
      description,
      action: upgradeUrl
        ? {
            label: 'Upgrade options',
            onClick: () => window.open(upgradeUrl, '_blank'),
          }
        : undefined,
    })
    return
  }

  toast.error(message)
}

/**
 * Reads newline-delimited JSON events from POST /api/campaigns/:id/process-figma.
 * Invokes onProgress for progress lines; resolves on done; rejects on error.
 */
export async function consumeProcessFigmaStream(
  response: Response,
  onProgress: (message: string | undefined) => void
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Failed to read response')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) continue

      try {
        const data = JSON.parse(line) as ProcessFigmaStreamEvent & Record<string, unknown>

        if (data.type === 'progress') {
          onProgress(typeof data.message === 'string' ? data.message : undefined)
        } else if (data.type === 'warning') {
          if (typeof data.message === 'string') {
            toast.warning(data.message)
          }
        } else if (data.type === 'error') {
          showStreamErrorToast(data)
          throw new ProcessFigmaStreamError(
            typeof data.message === 'string' ? data.message : 'An error occurred',
            true
          )
        } else if (data.type === 'done') {
          return
        }
      } catch (e) {
        if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
          throw e
        }
      }
    }
  }

  if (buffer.trim()) {
    try {
      const data = JSON.parse(buffer) as ProcessFigmaStreamEvent & Record<string, unknown>
      if (data.type === 'warning') {
        if (typeof data.message === 'string') {
          toast.warning(data.message)
        }
      } else if (data.type === 'error') {
        showStreamErrorToast(data)
        throw new ProcessFigmaStreamError(
          typeof data.message === 'string' ? data.message : 'An error occurred',
          true
        )
      } else if (data.type === 'done') {
        return
      }
    } catch (e) {
      if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
        throw e
      }
    }
  }
}
