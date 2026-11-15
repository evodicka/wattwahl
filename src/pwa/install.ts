type Navigator = {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
};

/**
 * True on an iPhone or iPad in a browser tab, not in the app from the home
 * screen. Only there the install hint of Z09 helps: Safari can delete the data
 * of a site after about seven days without use, an installed app is exempt.
 * iPadOS 13 and later reports itself as a Mac, with touch.
 */
export function isIosBrowserTab(
  navigator: Navigator = window.navigator,
  displayModeStandalone: boolean = window.matchMedia?.(
    '(display-mode: standalone)',
  ).matches ?? false,
): boolean {
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);
  return ios && navigator.standalone !== true && !displayModeStandalone;
}
