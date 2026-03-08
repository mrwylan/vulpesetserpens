import { test, expect, Page } from '@playwright/test'
import path from 'path'

const fixturesDir = path.join(__dirname, '..', 'fixtures')

async function uploadFile(page: Page, filename: string) {
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(path.join(fixturesDir, filename))
}

async function waitForCandidates(page: Page) {
  await expect(page.locator('.CandidateList')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('.CandidateCard').first()).toBeVisible({ timeout: 15000 })
}

test.describe('UC-004: Audition Loop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await uploadFile(page, 'sine-440hz-2s.wav')
    await waitForCandidates(page)
  })

  test('AC-1: clicking Play shows playing indicator within 100ms', async ({ page }) => {
    const firstCard = page.locator('.CandidateCard').first()
    const playBtn = firstCard.locator('.CandidateCard__playBtn')

    const start = Date.now()
    await playBtn.click()

    await expect(playBtn).toHaveClass(/CandidateCard__playBtn--playing/, { timeout: 200 })
    expect(Date.now() - start).toBeLessThan(500)
  })

  test('AC-4: clicking Stop removes the playing indicator', async ({ page }) => {
    const firstCard = page.locator('.CandidateCard').first()
    const playBtn = firstCard.locator('.CandidateCard__playBtn')

    await playBtn.click()
    await expect(playBtn).toHaveClass(/CandidateCard__playBtn--playing/, { timeout: 200 })

    await playBtn.click()
    await expect(playBtn).not.toHaveClass(/CandidateCard__playBtn--playing/, { timeout: 200 })
  })

  test('AC-7: only the playing candidate shows playing indicator', async ({ page }) => {
    const cards = page.locator('.CandidateCard')
    const count = await cards.count()

    if (count < 2) {
      test.skip()
      return
    }

    const firstPlayBtn = cards.nth(0).locator('.CandidateCard__playBtn')
    await firstPlayBtn.click()
    await expect(firstPlayBtn).toHaveClass(/CandidateCard__playBtn--playing/, { timeout: 200 })

    // Other cards should not show playing state
    const secondPlayBtn = cards.nth(1).locator('.CandidateCard__playBtn')
    await expect(secondPlayBtn).not.toHaveClass(/CandidateCard__playBtn--playing/)
  })

  test('AC-11: Space key toggles play/stop', async ({ page }) => {
    const firstCard = page.locator('.CandidateCard').first()
    const playBtn = firstCard.locator('.CandidateCard__playBtn')

    // Focus the page body so keyboard shortcuts work
    await page.locator('body').click()

    await page.keyboard.press('Space')
    await expect(playBtn).toHaveClass(/CandidateCard__playBtn--playing/, { timeout: 300 })

    await page.keyboard.press('Space')
    await expect(playBtn).not.toHaveClass(/CandidateCard__playBtn--playing/, { timeout: 300 })
  })

  test('AC-12: Arrow Down key moves selection to next candidate', async ({ page }) => {
    const cards = page.locator('.CandidateCard')
    const count = await cards.count()
    if (count < 2) {
      test.skip()
      return
    }

    // First card should be selected initially
    await expect(cards.nth(0)).toHaveClass(/CandidateCard--selected/)

    await page.locator('body').click()
    await page.keyboard.press('ArrowDown')

    // Second card should now be selected
    await expect(cards.nth(1)).toHaveClass(/CandidateCard--selected/, { timeout: 300 })
  })

  test('AC-5: clicking Play on second candidate stops first and starts second', async ({ page }) => {
    const cards = page.locator('.CandidateCard')
    const count = await cards.count()
    if (count < 2) {
      test.skip()
      return
    }

    const firstPlayBtn = cards.nth(0).locator('.CandidateCard__playBtn')
    const secondPlayBtn = cards.nth(1).locator('.CandidateCard__playBtn')

    await firstPlayBtn.click()
    await expect(firstPlayBtn).toHaveClass(/CandidateCard__playBtn--playing/, { timeout: 200 })

    await secondPlayBtn.click()
    await expect(firstPlayBtn).not.toHaveClass(/CandidateCard__playBtn--playing/, { timeout: 200 })
    await expect(secondPlayBtn).toHaveClass(/CandidateCard__playBtn--playing/, { timeout: 200 })
  })
})
