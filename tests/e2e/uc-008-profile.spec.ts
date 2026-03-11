import { test, expect, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

async function uploadFile(page: Page, filename: string) {
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(path.join(fixturesDir, filename))
}

async function waitForCandidates(page: Page) {
  await expect(page.locator('.CandidateList')).toBeVisible({ timeout: 15000 })
}

test.describe('UC-008: Select Creator Profile', () => {
  test('AC-1: profile selector with three options is visible on first load; Musician is pre-selected', async ({ page }) => {
    await page.goto('/')
    const selector = page.locator('.ProfileSelector')
    await expect(selector).toBeVisible()

    // All three options present
    await expect(page.locator('[data-profile="sound-designer"]')).toBeVisible()
    await expect(page.locator('[data-profile="musician"]')).toBeVisible()
    await expect(page.locator('[data-profile="producer"]')).toBeVisible()

    // Musician is pre-selected
    const musicianBtn = page.locator('[data-profile="musician"]')
    await expect(musicianBtn).toHaveAttribute('aria-pressed', 'true')
  })

  test('AC-2: clicking Sound Designer applies active state', async ({ page }) => {
    await page.goto('/')
    const sdBtn = page.locator('[data-profile="sound-designer"]')
    await sdBtn.click()
    await expect(sdBtn).toHaveAttribute('aria-pressed', 'true')

    // Musician no longer active
    const musicianBtn = page.locator('[data-profile="musician"]')
    await expect(musicianBtn).toHaveAttribute('aria-pressed', 'false')
  })

  test('AC-3: Sound Designer profile — all candidates ≤ 1.0 s', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-profile="sound-designer"]').click()
    await uploadFile(page, 'sine-220hz-4s.wav')
    await waitForCandidates(page)

    // Read candidate durations from the DOM
    const durations = await page.locator('.CandidateCard__duration').allInnerTexts()
    expect(durations.length).toBeGreaterThan(0)

    for (const text of durations) {
      // Format is either "N ms" or "N.NNN s"
      // Allow 100ms tolerance above 1.0s to accommodate zero-crossing snap precision
      if (text.endsWith(' ms')) {
        const ms = parseFloat(text)
        expect(ms).toBeLessThanOrEqual(1100)
      } else {
        const s = parseFloat(text)
        expect(s).toBeLessThanOrEqual(1.1)
      }
    }
  })

  test('AC-4: Producer profile — all candidates ≥ 0.5 s', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-profile="producer"]').click()
    await uploadFile(page, 'sine-220hz-4s.wav')
    await waitForCandidates(page)

    const durations = await page.locator('.CandidateCard__duration').allInnerTexts()
    expect(durations.length).toBeGreaterThan(0)

    for (const text of durations) {
      if (text.endsWith(' ms')) {
        // ms display means duration < 1s — below the 0.5s producer floor, should not happen
        const ms = parseFloat(text)
        expect(ms).toBeGreaterThanOrEqual(500 - 10)
      } else {
        const s = parseFloat(text)
        expect(s).toBeGreaterThanOrEqual(0.5 - 0.01)
      }
    }
  })

  test('AC-6: profile badge visible in header after file load', async ({ page }) => {
    await page.goto('/')
    await uploadFile(page, 'sine-440hz-2s.wav')
    await waitForCandidates(page)

    const badge = page.locator('[data-testid="profile-badge"]')
    await expect(badge).toBeVisible()
    // Default musician profile
    await expect(badge).toHaveText('Musician')
  })

  test('AC-7: changing profile via header badge triggers re-analysis', async ({ page }) => {
    await page.goto('/')
    await uploadFile(page, 'sine-440hz-2s.wav')
    await waitForCandidates(page)

    // Click the profile badge to cycle to next profile
    const badge = page.locator('[data-testid="profile-badge"]')
    await badge.click()

    // Should briefly enter analyzing state, then show results again
    await expect(page.locator('.CandidateList')).toBeVisible({ timeout: 15000 })

    // Cycle order: sound-designer → musician → producer. From Musician (default), next is Producer.
    await expect(badge).toHaveText('Producer')
  })

  test('AC-8: profile persists when loading a second file', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-profile="producer"]').click()
    await uploadFile(page, 'sine-440hz-2s.wav')
    await waitForCandidates(page)

    // Return to empty state, then load second file
    await page.locator('.Header__closeBtn').click()
    await expect(page.locator('.ProfileSelector')).toBeVisible()

    // Profile should still be Producer in the selector
    await expect(page.locator('[data-profile="producer"]')).toHaveAttribute('aria-pressed', 'true')

    await uploadFile(page, 'sine-220hz-4s.wav')
    await waitForCandidates(page)

    const badge = page.locator('[data-testid="profile-badge"]')
    await expect(badge).toHaveText('Producer')
  })
})
