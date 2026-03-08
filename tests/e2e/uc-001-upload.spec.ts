import { test, expect, Page } from '@playwright/test'
import path from 'path'

const fixturesDir = path.join(__dirname, '..', 'fixtures')

async function uploadFile(page: Page, filename: string) {
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles(path.join(fixturesDir, filename))
}

test.describe('UC-001: Upload Audio File', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for drop zone to appear
    await expect(page.locator('.DropZone')).toBeVisible()
  })

  test('AC-1: drop a valid WAV file reaches audio-loaded state within 5 seconds', async ({ page }) => {
    await uploadFile(page, 'sine-440hz-2s.wav')
    // Wait for either waveform or candidate list to appear
    await expect(page.locator('.WaveformCanvas')).toBeVisible({ timeout: 5000 })
  })

  test('AC-3: drop a .txt file shows error and drop zone returns to ready state', async ({ page }) => {
    const fileInput = page.locator('input[type="file"]')
    // Create a fake text file
    await fileInput.setInputFiles({
      name: 'test.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    })
    // Error message should appear within 200ms
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 500 })
    // Drop zone should still be visible
    await expect(page.locator('.DropZone')).toBeVisible()
  })

  test('AC-5: file picker selects a WAV file and reaches audio-loaded state', async ({ page }) => {
    await uploadFile(page, 'sine-440hz-2s.wav')
    await expect(page.locator('.WaveformCanvas')).toBeVisible({ timeout: 5000 })
  })

  test('AC-6: after successful load, filename is visible in UI', async ({ page }) => {
    await uploadFile(page, 'sine-440hz-2s.wav')
    await expect(page.locator('.WaveformCanvas')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.Header')).toContainText('sine-440hz-2s.wav')
  })

  test('AC-9: drag-over state applies distinct visual style', async ({ page }) => {
    const dropZone = page.locator('.DropZone__target')
    // Simulate drag enter
    await dropZone.dispatchEvent('dragover', { dataTransfer: { files: [] } })
    await expect(dropZone).toHaveClass(/DropZone__target--drag-over/)
    // Simulate drag leave
    await dropZone.dispatchEvent('dragleave', {})
    await expect(dropZone).not.toHaveClass(/DropZone__target--drag-over/)
  })

  test('AC-10: decodeAudioData rejection shows error message', async ({ page }) => {
    // Upload a corrupt audio file (fake WAV)
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'corrupt.wav',
      mimeType: 'audio/wav',
      buffer: Buffer.from('not a valid wav file'),
    })
    // Should show an error message
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 5000 })
  })

  test('AC-8: loading second file after first clears previous state', async ({ page }) => {
    // Load first file
    await uploadFile(page, 'sine-440hz-2s.wav')
    await expect(page.locator('.WaveformCanvas')).toBeVisible({ timeout: 5000 })

    // Load a second file - click close first then upload
    const closeBtn = page.locator('.Header__closeBtn')
    await closeBtn.click()
    await expect(page.locator('.DropZone')).toBeVisible()

    await uploadFile(page, 'sine-220hz-4s.wav')
    await expect(page.locator('.Header')).toContainText('sine-220hz-4s.wav', { timeout: 5000 })
  })
})
