import { test, expect, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

async function selectSoundDesignerAndLoad(page: Page, filename: string) {
  await page.goto('/')
  await page.locator('[data-profile="sound-designer"]').click()
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(path.join(fixturesDir, filename))
  await expect(page.locator('.CandidateList')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.CandidateCard').first()).toBeVisible()
}

test.describe('UC-010: Cut-Move-Crossfade Post-Processing', () => {

  test('AC-1: CMX button is present on candidate cards with Sound Designer profile', async ({ page }) => {
    await selectSoundDesignerAndLoad(page, 'sine-220hz-4s.wav')
    const cmxBtn = page.locator('[data-testid="cmx-button"]').first()
    await expect(cmxBtn).toBeVisible()
    await expect(cmxBtn).toContainText('Cut')
  })

  test('AC-2: CMX button is absent with Musician profile', async ({ page }) => {
    await page.goto('/')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(fixturesDir, 'sine-220hz-4s.wav'))
    await expect(page.locator('.CandidateList')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('[data-testid="cmx-button"]')).not.toBeAttached()
  })

  test('AC-2: CMX button is absent with Producer profile', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-profile="producer"]').click()
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(fixturesDir, 'sine-220hz-4s.wav'))
    await expect(page.locator('.CandidateList')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('[data-testid="cmx-button"]')).not.toBeAttached()
  })

  test('AC-14: Post-processing section is absent before any CMX operation', async ({ page }) => {
    await selectSoundDesignerAndLoad(page, 'sine-220hz-4s.wav')
    await expect(page.locator('[data-testid="derived-candidate-section"]')).not.toBeAttached()
  })

  test('AC-3: clicking CMX shows post-processing section with a derived card', async ({ page }) => {
    await selectSoundDesignerAndLoad(page, 'sine-220hz-4s.wav')

    const cmxBtn = page.locator('[data-testid="cmx-button"]').first()
    await cmxBtn.click()

    const section = page.locator('[data-testid="derived-candidate-section"]')
    await expect(section).toBeVisible({ timeout: 2000 })
    await expect(page.locator('[data-testid="derived-candidate-card"]')).toHaveCount(1)
  })

  test('AC-10: derived card shows CMX badge and source reference', async ({ page }) => {
    await selectSoundDesignerAndLoad(page, 'sine-220hz-4s.wav')
    await page.locator('[data-testid="cmx-button"]').first().click()

    const card = page.locator('[data-testid="derived-candidate-card"]').first()
    await expect(card.locator('[data-testid="cmx-badge"]')).toBeVisible({ timeout: 2000 })
    await expect(card.locator('[data-testid="cmx-badge"]')).toHaveText('CMX')
    await expect(card).toContainText('from #')
  })

  test('AC-11: source candidate in main row is unchanged after CMX', async ({ page }) => {
    await selectSoundDesignerAndLoad(page, 'sine-220hz-4s.wav')

    // Record original duration of first candidate
    const originalDuration = await page.locator('.CandidateCard__duration').first().innerText()

    await page.locator('[data-testid="cmx-button"]').first().click()
    await expect(page.locator('[data-testid="derived-candidate-card"]')).toHaveCount(1, { timeout: 2000 })

    // Source candidate duration should be unchanged
    const durationAfter = await page.locator('.CandidateCard__duration').first().innerText()
    expect(durationAfter).toBe(originalDuration)
  })

  test('AC-4: derived candidate duration is approximately source duration minus 1/24', async ({ page }) => {
    await selectSoundDesignerAndLoad(page, 'sine-220hz-4s.wav')

    const sourceDurationText = await page.locator('.CandidateCard__duration').first().innerText()
    await page.locator('[data-testid="cmx-button"]').first().click()

    const card = page.locator('[data-testid="derived-candidate-card"]').first()
    await expect(card).toBeVisible({ timeout: 2000 })
    const derivedDurationText = await card.locator('.DerivedCandidateCard__duration').innerText()

    // Parse both durations (may be in "N ms" or "N.NNN s" format)
    const parseDuration = (text: string): number => {
      if (text.endsWith(' ms')) return parseFloat(text) / 1000
      return parseFloat(text)
    }

    const src = parseDuration(sourceDurationText)
    const derived = parseDuration(derivedDurationText)

    // derived ≈ src * (23/24) ± tolerance (2ms + rounding)
    const expectedApprox = src * (23 / 24)
    expect(Math.abs(derived - expectedApprox)).toBeLessThan(0.005) // 5 ms tolerance
  })

  test('AC-12: clicking CMX multiple times appends multiple derived cards', async ({ page }) => {
    await selectSoundDesignerAndLoad(page, 'sine-220hz-4s.wav')

    const cmxBtn = page.locator('[data-testid="cmx-button"]').first()
    await cmxBtn.click()
    await expect(page.locator('[data-testid="derived-candidate-card"]')).toHaveCount(1, { timeout: 2000 })

    // Click CMX on a different candidate if available, or same one again
    const cmxBtns = page.locator('[data-testid="cmx-button"]')
    const count = await cmxBtns.count()
    if (count > 1) {
      await cmxBtns.nth(1).click()
    } else {
      await cmxBtns.first().click()
    }
    await expect(page.locator('[data-testid="derived-candidate-card"]')).toHaveCount(2, { timeout: 2000 })
  })

  test('AC-9: export button on derived card triggers a WAV download', async ({ page }) => {
    await selectSoundDesignerAndLoad(page, 'sine-220hz-4s.wav')
    await page.locator('[data-testid="cmx-button"]').first().click()

    const card = page.locator('[data-testid="derived-candidate-card"]').first()
    await expect(card).toBeVisible({ timeout: 2000 })

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5000 }),
      card.locator('.DerivedCandidateCard__exportBtn').click(),
    ])

    expect(download.suggestedFilename()).toMatch(/_cmx\.wav$/)
  })
})
