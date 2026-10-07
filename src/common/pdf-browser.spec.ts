import { buildLaunchArgs } from './pdf-browser.js';

describe('buildLaunchArgs', () => {
  it('always disables /dev/shm use and keeps the sandbox on by default', () => {
    expect(buildLaunchArgs({})).toEqual(['--disable-dev-shm-usage']);
  });

  it('turns the sandbox off only when PUPPETEER_NO_SANDBOX is exactly "true"', () => {
    expect(buildLaunchArgs({ PUPPETEER_NO_SANDBOX: 'true' })).toEqual([
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ]);
  });

  it.each(['false', '1', 'TRUE', ''])('keeps the sandbox on for PUPPETEER_NO_SANDBOX=%j', (value) => {
    expect(buildLaunchArgs({ PUPPETEER_NO_SANDBOX: value })).toEqual(['--disable-dev-shm-usage']);
  });
});
