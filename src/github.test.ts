import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { detectGitHubContext, findExistingComment, upsertPrComment } from './github.js'
import type { GitHubContext } from './github.js'

// ── detectGitHubContext ──────────────────────────────────────────────

describe('detectGitHubContext', () => {
  const originalEnv = { ...process.env }
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `duelist-gh-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
    // Clean relevant env vars
    delete process.env.GITHUB_TOKEN
    delete process.env.GITHUB_REPOSITORY
    delete process.env.GITHUB_EVENT_PATH
    delete process.env.DUELIST_PR_NUMBER
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true })
    }
  })

  it('returns null when GITHUB_TOKEN is missing', () => {
    process.env.GITHUB_REPOSITORY = 'owner/repo'
    expect(detectGitHubContext()).toBeNull()
  })

  it('returns null when GITHUB_REPOSITORY is missing', () => {
    process.env.GITHUB_TOKEN = 'ghp_test'
    expect(detectGitHubContext()).toBeNull()
  })

  it('returns null when no PR number can be detected', () => {
    process.env.GITHUB_TOKEN = 'ghp_test'
    process.env.GITHUB_REPOSITORY = 'owner/repo'
    expect(detectGitHubContext()).toBeNull()
  })

  it('reads PR number from pull_request event payload', () => {
    const eventFile = join(tmpDir, 'event.json')
    writeFileSync(eventFile, JSON.stringify({
      pull_request: { number: 42 },
    }))

    process.env.GITHUB_TOKEN = 'ghp_test'
    process.env.GITHUB_REPOSITORY = 'DataGobes/agent-duelist'
    process.env.GITHUB_EVENT_PATH = eventFile

    const ctx = detectGitHubContext()
    expect(ctx).toEqual({
      token: 'ghp_test',
      owner: 'DataGobes',
      repo: 'agent-duelist',
      prNumber: 42,
    })
  })

  it('reads PR number from DUELIST_PR_NUMBER fallback', () => {
    process.env.GITHUB_TOKEN = 'ghp_test'
    process.env.GITHUB_REPOSITORY = 'owner/repo'
    process.env.DUELIST_PR_NUMBER = '99'

    const ctx = detectGitHubContext()
    expect(ctx?.prNumber).toBe(99)
  })
})

// ── findExistingComment + upsertPrComment ────────────────────────────

describe('findExistingComment', () => {
  const ctx: GitHubContext = {
    token: 'ghp_test',
    owner: 'owner',
    repo: 'repo',
    prNumber: 1,
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('finds comment containing marker', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([
        { id: 100, body: 'some other comment' },
        { id: 200, body: '<!-- duelist-ci-report -->\nresults here' },
      ]), { status: 200 })
    )

    const id = await findExistingComment(ctx, '<!-- duelist-ci-report -->')
    expect(id).toBe(200)
    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('returns null when no comment matches', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([
        { id: 100, body: 'unrelated' },
      ]), { status: 200 })
    )

    const id = await findExistingComment(ctx, '<!-- duelist-ci-report -->')
    expect(id).toBeNull()
  })

  it('returns null on API error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Not Found', { status: 404 })
    )

    const id = await findExistingComment(ctx, '<!-- duelist-ci-report -->')
    expect(id).toBeNull()
  })
})

describe('upsertPrComment', () => {
  const ctx: GitHubContext = {
    token: 'ghp_test',
    owner: 'owner',
    repo: 'repo',
    prNumber: 1,
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates new comment when none exists', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      // findExistingComment — no matches
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      // create comment
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 300 }), { status: 201 }))

    await upsertPrComment(ctx, 'report body', '<!-- marker -->')

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const createCall = fetchSpy.mock.calls[1]!
    expect(createCall[0]).toContain('/issues/1/comments')
    expect(createCall[1]?.method).toBe('POST')
  })

  it('updates existing comment', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      // findExistingComment — found
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: 200, body: '<!-- marker -->\nold body' },
      ]), { status: 200 }))
      // update comment
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 200 }), { status: 200 }))

    await upsertPrComment(ctx, 'new body', '<!-- marker -->')

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const updateCall = fetchSpy.mock.calls[1]!
    expect(updateCall[0]).toContain('/issues/comments/200')
    expect(updateCall[1]?.method).toBe('PATCH')
  })

  it('warns but does not throw on API failure', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response('Forbidden', { status: 403 }))

    await upsertPrComment(ctx, 'body', '<!-- marker -->')

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to create PR comment'))
  })
})
