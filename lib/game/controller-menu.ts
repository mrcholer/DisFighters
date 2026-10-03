import type { PadCommand } from "./gamepads";

const destructive = (button: HTMLButtonElement) => /FORFEIT|WITHDRAW|LEAVE |RESTART|NEW TOURNAMENT/.test(button.textContent ?? "");
const visible = (button: HTMLButtonElement) => !button.disabled && button.getClientRects().length > 0;
export function controllerMenu(root: HTMLElement, command: PadCommand) {
  const scope = root.querySelector<HTMLElement>("dialog[open], .pause-panel, .result-overlay") ?? root;
  const buttons = [...scope.querySelectorAll<HTMLButtonElement>("button")].filter(visible);
  if (!buttons.length) return;
  const focused = buttons.find(button => button === document.activeElement);
  const primary = buttons.find(button => button.hasAttribute("data-controller-primary") && !destructive(button))
    ?? buttons.find(button => button.classList.contains("primary-button") && !destructive(button));
  if (command === "confirm" || command === "pause") {
    const button = command === "confirm" ? focused ?? primary : primary;
    button?.click(); return;
  }
  if (["left", "right", "up", "down"].includes(command)) {
    const index = focused ? buttons.indexOf(focused) : primary ? buttons.indexOf(primary) : 0;
    const delta = command === "left" || command === "up" ? -1 : 1;
    const next = focused ? buttons[(index + delta + buttons.length) % buttons.length] : buttons[index];
    next.focus({ preventScroll: true }); next.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}
