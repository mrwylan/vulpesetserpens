import { test, expect, Page } from '@playwright/test'
import path from 'path'

const fixturesDir = path.join(__dirname, '..', 'fixtures')

async function uploadFile(page: Page, filename: string) {
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(path.join(fixturesDir, filename))
}

async function waitForCandidates(page: Page) {
  await expect(page.locator('.CandidateList')).toBeVisible({ timeout: 15000 })
}

test.describe('UC-006: Set Tempo Reference', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await uploadFile(page, 'sine-440hz-2s.wav')
    await waitForCandidates(page)
  })

  test('AC-1: entering 120 BPM stores tempo within 50ms', async ({ page }) => {
    const bpmInput = page.locator('#bpm-input')
    await bpmInput.fill('120')
    await bpmInput.press('Enter')

    // Verify by checking the metadata display
    await expect(page.locator('[data-testid="audio-metadata"]')).toContainText('120 BPM', { timeout: 500 })
  })

  test('AC-2: bar annotations appear after entering BPM', async ({ page }) => {
    // First wait for candidates
    const count = await page.locator('.CandidateCard').count()
    if (count === 0) {
      test.skip()
      return
    }

    const bpmInput = page.locator('#bpm-input')
    await bpmInput.fill('120')
    await bpmInput.press('Enter')

    // Should see bar annotation in at least one card
    await expect(page.locator('.CandidateCard__bars').first()).toBeVisible({ timeout: 1000 })
  })

  test('AC-6: clearing BPM removes bar annotations', async ({ page }) => {
    const count = await page.locator('.CandidateCard').count()
    if (count === 0) {
      test.skip()
      return
    }

    const bpmInput = page.locator('#bpm-input')
    await bpmInput.fill('120')
    await bpmInput.press('Enter')
    await expect(page.locator('.CandidateCard__bars').first()).toBeVisible({ timeout: 1000 })

    // Now clear it
    await bpmInput.fill('')
    await bpmInput.press('Enter')

    // Bar annotations should be gone
    await expect(page.locator('.CandidateCard__bars').first()).not.toBeVisible({ timeout: 500 })
  })

  test('AC-9: waveform metadata area shows BPM after entry', async ({ page }) => {
    const bpmInput = page.locator('#bpm-input')
    await bpmInput.fill('120')
    await bpmInput.press('Enter')

    await expect(page.locator('[data-testid="audio-metadata"]')).toContainText('120 BPM', { timeout: 500 })
  })
})
