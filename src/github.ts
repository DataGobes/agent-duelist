import { readFileSync } from 'node:fs'

// ── Types ────────────────────────────────────────────────────────────

export interface GitHubContext {
  token: string
  owner: string
  repo: string
  prNumber: number
}

interface GitHubComment {
  id: number
  body?: string
}

// ── Context detection ────────────────────────────────────────────────

export function detectGitHubContext(): GitHubContext | null {
  const token = process.env.GITHUB_TOKEN
  const repository = process.env.GITHUB_REPOSITORY
  const eventPath = process.env.GITHUB_EVENT_PATH

  if (!token || !repository) return null

  const [owner, repo] = repository.split('/')
  if (!owner || !repo) return null

  let prNumber: number | undefined

  // Try to get PR number from event payload
  if (eventPath) {
    try {
      const event = JSON.parse(readFileSync(eventPath, 'utf-8')) as Record<string, unknown>

      // pull_request event
      if (event.pull_request && typeof event.pull_request === 'object') {
        const pr = event.pull_request as Record<string, unknown>
        prNumber = pr.number as number
      }

      // issue_comment or other events with issue.pull_request
      if (!prNumber && event.issue && typeof event.issue === 'object') {
        const issue = event.issue as Record<string, unknown>
        if (issue.pull_request) {
          prNumber = issue.number as number
        }
      }
    } catch {
      // Can't read event file — not fatal
    }
  }

  // Fallback: DUELIST_PR_NUMBER env var for manual use
  if (!prNumber && process.env.DUELIST_PR_NUMBER) {
    prNumber = parseInt(process.env.DUELIST_PR_NUMBER, 10)
  }

  if (!prNumber) return null

  return { token, owner, repo, prNumber }
}

// ── PR comment helpers ───────────────────────────────────────────────

const API_BASE = 'https://api.github.com'

function ghHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...extra,
  }
}

export async function findExistingComment(
  ctx: GitHubContext,
  marker: string,
): Promise<number | null> {
  let page = 1
  const perPage = 50

  while (true) {
    const url = `${API_BASE}/repos/${ctx.owner}/${ctx.repo}/issues/${ctx.prNumber}/comments?per_page=${perPage}&page=${page}`
    const res = await fetch(url, { headers: ghHeaders(ctx.token) })

    if (!res.ok) return null

    const comments = (await res.json()) as GitHubComment[]
    if (comments.length === 0) break

    for (const comment of comments) {
      if (comment.body?.includes(marker)) {
        return comment.id
      }
    }

    if (comments.length < perPage) break
    page++
  }

  return null
}

export async function upsertPrComment(
  ctx: GitHubContext,
  body: string,
  marker: string,
): Promise<void> {
  const existingId = await findExistingComment(ctx, marker)

  if (existingId) {
    // Update existing comment
    const url = `${API_BASE}/repos/${ctx.owner}/${ctx.repo}/issues/comments/${existingId}`
    const res = await fetch(url, {
      method: 'PATCH',
      headers: ghHeaders(ctx.token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ body }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.warn(`Failed to update PR comment: ${res.status} ${text}`)
    }
  } else {
    // Create new comment
    const url = `${API_BASE}/repos/${ctx.owner}/${ctx.repo}/issues/${ctx.prNumber}/comments`
    const res = await fetch(url, {
      method: 'POST',
      headers: ghHeaders(ctx.token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ body }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.warn(`Failed to create PR comment: ${res.status} ${text}`)
    }
  }
}
