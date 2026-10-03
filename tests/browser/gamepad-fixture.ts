import type { Page } from "@playwright/test";
interface VirtualPad { id?: string; buttons?: number[]; axes?: number[]; mapping?: string }
declare global { interface Window { disfightersTestPads: (Gamepad | null)[] } }
export async function virtualControllers(page: Page) {
  await page.addInitScript(() => {
    window.disfightersTestPads = [];
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => window.disfightersTestPads });
  });
}
export async function setPad(page: Page, index: number, update: VirtualPad | null = {}) {
  await page.evaluate(({ index, update }) => {
    if (update === null) { window.disfightersTestPads[index] = null; return; }
    const previous = window.disfightersTestPads[index];
    window.disfightersTestPads[index] = {
      index, id: update.id ?? previous?.id ?? "Xbox XInput", mapping: update.mapping ?? previous?.mapping ?? "standard", connected: true,
      axes: update.axes ?? previous?.axes ?? [0, 0, 0, 0],
      buttons: update.buttons ? Array.from({ length: 17 }, (_, index) => ({ pressed: update.buttons!.includes(index), touched: update.buttons!.includes(index), value: update.buttons!.includes(index) ? 1 : 0 }))
        : previous?.buttons ?? Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), timestamp: performance.now(),
    } as Gamepad;
  }, { index, update });
  // Observe at least two polling frames before changing this virtual hardware state.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.waitForTimeout(100);
}
export async function pressPad(page: Page, index: number, button: number) {
  await setPad(page, index, { buttons: [] });
  await setPad(page, index, { buttons: [button] }); await setPad(page, index, { buttons: [] });
}
export async function holdPad(page: Page, index: number, buttons: number[], duration: number) {
  await setPad(page, index, { buttons }); await page.waitForTimeout(duration); await setPad(page, index, { buttons: [] });
}
