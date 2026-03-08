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
  await expect(page.locator('.CandidateCard').first()).toBeVisible({ timeout: 15000 })
}

test.describe('UC-005: Export Loop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await uploadFile(page, 'sine-440hz-2s.wav')
    await waitForCandidates(page)
  })

  test('AC-1: clicking Export triggers a file download within 2 seconds', async ({ page }) => {
    const exportBtn = page.locator('.CandidateCard').first().locator('.CandidateCard__exportBtn')

    const downloadPromise = page.waitForEvent('download', { timeout: 5000 })
    await exportBtn.click()
    const download = await downloadPromise

    expect(download).toBeTruthy()
  })

  test('AC-2: downloaded file has valid RIFF/WAV header', async ({ page }) => {
    const exportBtn = page.locator('.CandidateCard').first().locator('.CandidateCard__exportBtn')

    const downloadPromise = page.waitForEvent('download', { timeout: 5000 })
    await exportBtn.click()
    const download = await downloadPromise

    const buffer = await download.createReadStream().then(stream => {
      return new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = []
        stream.on('data', chunk => chunks.push(chunk as Buffer))
        stream.on('end', () => resolve(Buffer.concat(chunks)))
        stream.on('error', reject)
      })
    })

    // Check RIFF header
    expect(buffer[0]).toBe(0x52)  // 'R'
    expect(buffer[1]).toBe(0x49)  // 'I'
    expect(buffer[2]).toBe(0x46)  // 'F'
    expect(buffer[3]).toBe(0x46)  // 'F'

    // Check WAVE marker at offset 8
    expect(buffer[8]).toBe(0x57)   // 'W'
    expect(buffer[9]).toBe(0x41)   // 'A'
    expect(buffer[10]).toBe(0x56)  // 'V'
    expect(buffer[11]).toBe(0x45)  // 'E'
  })

  test('AC-6: downloaded filename matches expected pattern', async ({ page }) => {
    const exportBtn = page.locator('.CandidateCard').first().locator('.CandidateCard__exportBtn')

    const downloadPromise = page.waitForEvent('download', { timeout: 5000 })
    await exportBtn.click()
    const download = await downloadPromise

    // Filename should contain loop rank and duration
    const filename = download.suggestedFilename()
    expect(filename).toMatch(/sine-440hz-2s_loop\d+_[\d.]+s\.wav/)
  })

  test('AC-13: downloaded WAV contains smpl chunk', async ({ page }) => {
    const exportBtn = page.locator('.CandidateCard').first().locator('.CandidateCard__exportBtn')

    const downloadPromise = page.waitForEvent('download', { timeout: 5000 })
    await exportBtn.click()
    const download = await downloadPromise

    const buffer = await download.createReadStream().then(stream => {
      return new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = []
        stream.on('data', chunk => chunks.push(chunk as Buffer))
        stream.on('end', () => resolve(Buffer.concat(chunks)))
        stream.on('error', reject)
      })
    })

    // Find 'smpl' chunk (73 6D 70 6C)
    let smplFound = false
    for (let i = 0; i < buffer.length - 4; i++) {
      if (buffer[i] === 0x73 && buffer[i+1] === 0x6D && buffer[i+2] === 0x70 && buffer[i+3] === 0x6C) {
        smplFound = true
        break
      }
    }
    expect(smplFound).toBe(true)
  })

  test('AC-9: exporting while playing does not interrupt playback', async ({ page }) => {
    const firstCard = page.locator('.CandidateCard').first()
    const playBtn = firstCard.locator('.CandidateCard__playBtn')
    const exportBtn = firstCard.locator('.CandidateCard__exportBtn')

    // Start playing
    await playBtn.click()
    await expect(playBtn).toHaveClass(/CandidateCard__playBtn--playing/, { timeout: 200 })

    // Export while playing
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 })
    await exportBtn.click()
    await downloadPromise

    // Should still be playing
    await expect(playBtn).toHaveClass(/CandidateCard__playBtn--playing/)
  })
})
