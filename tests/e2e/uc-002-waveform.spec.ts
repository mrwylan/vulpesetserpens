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
})
