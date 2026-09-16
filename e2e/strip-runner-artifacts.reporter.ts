import fs from 'node:fs'
import path from 'node:path'
import type { FullConfig, Reporter, TestCase, TestResult } from '@playwright/test/reporter'

/**
 * NOTHING THIS SUITE WRITES SURVIVES THE RUN THAT WROTE IT, ON A RUNNER 19 REPOSITORIES SHARE.
 *
 * ══ WHY `trace/screenshot/video: 'off'` WAS NOT ENOUGH ════════════════════════════════════════
 *
 * playwright.config.ts turned all three recorders off on 2026-09-14, after a trace of
 * auth.setup.ts was found on the shared runner holding live staging session tokens. That closed
 * three channels and left a fourth open, and on the same evening the fourth one fired.
 *
 * Playwright 1.62 writes an ERROR CONTEXT for any test that ends with errors. It is not a
 * recorder and none of the three switches reach it - node_modules/playwright/lib/index.js gates
 * it on `this._testInfo.errors.length > 0` and nothing else:
 *
 *     const filePath = this._testInfo.outputPath('error-context.md')
 *     await fs.promises.writeFile(filePath, errorContextContent, 'utf8')
 *
 * The content is `pageSnapshot` - an ARIA snapshot of the page as it stood when the test failed.
 * On an authenticated suite that is the signed-in application, including the contents of form
 * fields. A FAILING AUTH TEST PHOTOGRAPHS THE PASSWORD FIELD; an ARIA snapshot is the same
 * photograph in text, and the fleet rule is that a secret is never rendered anywhere.
 *
 * ══ AND IT DOES NOT TAKE A FAILING RUN ═══════════════════════════════════════════════════════
 *
 * `retries: 2` in CI means a FLAKY test writes one of these and the job still goes green. That is
 * what happened in run 34898267882, job 104159648677, which concluded SUCCESS:
 *
 *     ✘  20 [chromium] › e2e/monitoring-openable-counts.spec.ts:422:1 › ... (2.2m)
 *     ✓  21 [chromium] › e2e/monitoring-openable-counts.spec.ts:422:1 › ... (retry #1) (8.4s)
 *     1 flaky, 91 passed
 *
 * The green job left an ARIA snapshot of a signed-in page on wsl-LAPTOP-88N97BGG-cockpit-4, and
 * the base reporter announced its path in the log. So "the suite passed" never implied "the
 * runner is clean", and the only reason the first sweep on 2026-09-14 found the disk empty is
 * that a later checkout's `git clean -ffdx` had already run. A guard that passes because somebody
 * else happened to tidy up is not a guard.
 *
 * ══ WHAT THIS DOES ═══════════════════════════════════════════════════════════════════════════
 *
 *   onTestEnd  every attachment whose file sits inside a project's outputDir is DELETED, and then
 *              removed from `result.attachments`. The removal is what keeps the path out of the
 *              log: the base reporter prints `Error Context: <path>` straight out of that array
 *              (runner/index.js), and a path in a CI log is a map to the file for the next 7 days
 *              even after the file itself is gone.
 *   onEnd      the outputDir itself is removed, which catches anything written but never attached.
 *
 * Registered BEFORE 'list' in playwright.config.ts. Reporters are called in array order and share
 * one TestResult, so mutating here is what the reporter after it sees.
 *
 * IT NEVER NAMES A PATH IN ITS OWN OUTPUT. Logging what it deleted would put the very string back
 * into the job log that deleting the file was meant to remove, and the guard that reads that log
 * (test/no-test-recording-on-the-build-machine-holds-a-credential.test.mjs) would stay red for a
 * file that no longer exists. It prints a COUNT, which is the same rule the fleet uses for proving
 * a secret exists without rendering it.
 *
 * IT NEVER OPENS WHAT IT DELETES. Reading an error context to check whether this one happened to
 * hold a credential is the leak, not the precaution.
 */
class StripRunnerArtifacts implements Reporter {
  private outputDirs: string[] = []
  private removed = 0

  onBegin(config: FullConfig): void {
    for (const project of config.projects) {
      if (project.outputDir) this.outputDirs.push(path.resolve(project.outputDir))
    }
  }

  /** Is `file` inside one of the suite's own output directories? Never a path we were only given. */
  private isOurs(file: string): boolean {
    const resolved = path.resolve(file)
    return this.outputDirs.some((dir) => {
      const rel = path.relative(dir, resolved)
      return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
    })
  }

  onTestEnd(_test: TestCase, result: TestResult): void {
    for (let i = result.attachments.length - 1; i >= 0; i--) {
      const attachment = result.attachments[i]
      if (!attachment.path || !this.isOurs(attachment.path)) continue
      try {
        fs.rmSync(attachment.path, { force: true })
      } catch {
        // A file we cannot delete must still not be advertised in the log, so fall through to the
        // splice: onEnd's directory sweep is the second attempt, and the guard is the third.
      }
      result.attachments.splice(i, 1)
      this.removed++
    }
  }

  onEnd(): void {
    for (const dir of this.outputDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch {
        // Best effort by design: this reporter must never be the reason a suite fails.
      }
    }
    if (this.removed > 0) {
      console.log(
        `strip-runner-artifacts: removed ${this.removed} attachment file(s) written by this run, `
          + `and swept ${this.outputDirs.length} output director(y/ies). Paths are deliberately not `
          + `printed - naming one in the job log is the exposure this removes.`,
      )
    }
  }
}

export default StripRunnerArtifacts
