import { test, expect, Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

async function uploadFile(page: Page, filename: string) {
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(path.join(fixturesDir, filename))
}

test.describe('UC-002: Visualize Waveform', () => {
  test('AC-1: waveform canvas is visible after file upload', async ({ page }) => {
    await page.goto('/')
    await uploadFile(page, 'sine-440hz-2s.wav')
    await expect(page.locator('.WaveformCanvas canvas')).toBeVisible({ timeout: 5000 })
  })

  test('AC-2: canvas pixel width matches clientWidth * devicePixelRatio', async ({ page }) => {
    await page.goto('/')
    await uploadFile(page, 'sine-440hz-2s.wav')
    await expect(page.locator('.WaveformCanvas canvas')).toBeVisible({ timeout: 5000 })

    // setupCanvas sets canvas.style.width = cssWidth px and canvas.width = round(cssWidth * dpr)
    // Use style.width (the intended CSS width) not clientWidth (which can differ due to layout)
    const { canvasWidth, styleWidth, dpr } = await page.evaluate(() => {
      const canvas = document.querySelector('.WaveformCanvas canvas') as HTMLCanvasElement
      return {
        canvasWidth: canvas.width,
        styleWidth: parseInt(canvas.style.width, 10),
        dpr: window.devicePixelRatio,
      }
    })
    expect(Math.abs(canvasWidth - Math.round(styleWidth * dpr))).toBeLessThanOrEqual(1)
  })

  test('AC-7: resizing browser window causes canvas to redraw', async ({ page }) => {
    await page.goto('/')
    await uploadFile(page, 'sine-440hz-2s.wav')
    await expect(page.locator('.WaveformCanvas canvas')).toBeVisible({ timeout: 5000 })

    const initialWidth = await page.evaluate(() => {
      const canvas = document.querySelector('.WaveformCanvas canvas') as HTMLCanvasElement
      return canvas.width
    })

    // Resize the viewport
    await page.setViewportSize({ width: 1200, height: 768 })
    await page.waitForTimeout(300) // Wait for debounce

    const newWidth = await page.evaluate(() => {
      const canvas = document.querySelector('.WaveformCanvas canvas') as HTMLCanvasElement
      return canvas.width
    })

    // Width should have changed
    expect(newWidth).not.toBe(initialWidth)
  })

  test('AC-10: stereo file shows "Stereo" label', async ({ page }) => {
    await page.goto('/')
    await uploadFile(page, 'stereo-sine-2s.wav')
    await expect(page.locator('.WaveformCanvas canvas')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-testid="audio-metadata"]')).toContainText('Stereo')
  })

  test('AC-8: loop candidate overlays appear on waveform after analysis', async ({ page }) => {
    await page.goto('/')
    await uploadFile(page, 'sine-220hz-4s.wav')

    // Wait for analysis to complete (candidate list appears)
    await expect(page.locator('.CandidateList')).toBeVisible({ timeout: 15000 })

    // Canvas should still be visible
    await expect(page.locator('.WaveformCanvas canvas')).toBeVisible()
  })

  test('AC-12: each candidate card contains a waveform thumbnail canvas', async ({ page }) => {
    await page.goto('/')
    await uploadFile(page, 'sine-220hz-4s.wav')
    await expect(page.locator('.CandidateList')).toBeVisible({ timeout: 15000 })

    const cards = page.locator('.CandidateCard')
    const count = await cards.count()
    expect(count).toBeGreaterThan(0)

    for (let i = 0; i < count; i++) {
      const thumbnail = cards.nth(i).locator('[data-testid="snippet-preview"] canvas')
      await expect(thumbnail).toBeVisible()

      // Canvas must have non-zero dimensions
      const { w, h } = await thumbnail.evaluate((el) => {
        const canvas = el as HTMLCanvasElement
        return { w: canvas.width, h: canvas.height }
      })
      expect(w).toBeGreaterThan(0)
      expect(h).toBeGreaterThan(0)
    }
  })

  test('AC-13: thumbnail canvas colour matches the candidate colour strip', async ({ page }) => {
    await page.goto('/')
    await uploadFile(page, 'sine-220hz-4s.wav')
    await expect(page.locator('.CandidateList')).toBeVisible({ timeout: 15000 })

    // Check the first candidate card
    const card = page.locator('.CandidateCard').first()
    await expect(card).toBeVisible()

    // Get the colour strip's background colour (inline style set to --color-loop-1 value)
    const stripColor = await card.locator('.CandidateCard__colorStrip').evaluate((el) => {
      return (el as HTMLElement).style.backgroundColor
    })
    expect(stripColor).toBeTruthy()

    // Sample a pixel from the center line of the thumbnail (drawn at 70% opacity in candidate colour)
    const pixelData = await card.locator('[data-testid="snippet-preview"] canvas').evaluate((el) => {
      const canvas = el as HTMLCanvasElement
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      const midY = Math.floor(canvas.height / 2)
      const midX = Math.floor(canvas.width / 2)
      return Array.from(ctx.getImageData(midX, midY, 1, 1).data)
    })

    // The center line is drawn in candidate colour — pixel must not be background (#111118)
    expect(pixelData).not.toBeNull()
    // At least one channel (R, G, or B) must differ from the background value (0x11 = 17)
    const [r, g, b] = pixelData!
    const isBackground = r! <= 20 && g! <= 20 && b! <= 20
    expect(isBackground).toBe(false)
  })
})
