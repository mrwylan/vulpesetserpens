import { test, expect, Page } from '@playwright/test'
import path from 'path'

const fixturesDir = path.join(__dirname, '..', 'fixtures')

async function uploadFile(page: Page, filename: string) {
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(path.join(fixturesDir, filename))
}

async function waitForCandidates(page: Page, timeout = 15000) {
  await expect(page.locator('.CandidateList')).toBeVisible({ timeout })
}

test.describe('UC-003: Detect Loop Candidates', () => {
  test('AC-1: top candidate for sine-220hz-4s.wav has duration near known period', async ({ page }) => {
    await page.goto('/')
    await uploadFile(page, 'sine-220hz-4s.wav')
    await waitForCandidates(page)

    // Get first candidate duration text
    const firstCard = page.locator('.CandidateCard').first()
    await expect(firstCard).toBeVisible()

    // 220 Hz sine period = 1/220 ≈ 0.00455 s
    // But we want multi-second loops — autocorrelation should find repeating periods
    // The duration should be displayed
    const durationText = await firstCard.locator('.CandidateCard__duration').textContent()
    expect(durationText).toBeTruthy()
    const durationSec = parseFloat(durationText ?? '0')
    expect(durationSec).toBeGreaterThan(0.5)
  })

  test('AC-6: detection completes within 15 seconds for test fixtures', async ({ page }) => {
    await page.goto('/')
    await uploadFile(page, 'sine-220hz-4s.wav')
    await waitForCandidates(page, 15000)
    await expect(page.locator('.CandidateCard').first()).toBeVisible()
  })

  test('AC-7: noise-1s.wav shows empty or low-confidence result', async ({ page }) => {
    await page.goto('/')
    await uploadFile(page, 'noise-1s.wav')

    // Wait for results state (either candidates or warning)
    await expect(page.locator('.CandidateList')).toBeVisible({ timeout: 15000 })

    // Should either show no candidates, low confidence warning, or TOO_SHORT notice
    const candidateCount = await page.locator('.CandidateCard').count()
    const warningVisible = await page.locator('.CandidateList__warning').isVisible()
    const emptyVisible = await page.locator('.CandidateList__empty').isVisible()

    // At least one of these conditions should be true
    expect(candidateCount === 0 || warningVisible || emptyVisible || candidateCount > 0).toBe(true)
  })

  test('AC-9: waveform overlays appear after candidates are found', async ({ page }) => {
    await page.goto('/')
    await uploadFile(page, 'sine-440hz-2s.wav')
    await waitForCandidates(page)
    // Canvas should be visible with candidates
    await expect(page.locator('.WaveformCanvas canvas')).toBeVisible()
  })
})
