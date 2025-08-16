/**
 * iOS-specific utilities for handling keyboard input and version detection
 */

import { createLogger } from './logger.js';

const logger = createLogger('ios-utils');

/**
 * Detect if the browser is running on iOS
 */
export function isIOS(): boolean {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || '';

  // Check for iPhone, iPad, iPod in user agent
  const hasIOSUserAgent = /iphone|ipad|ipod/.test(userAgent);

  // Check for iOS platform
  const hasIOSPlatform =
    platform.startsWith('iphone') || platform.startsWith('ipad') || platform.startsWith('ipod');

  // Check for iOS Safari specific behavior
  const hasIOSTouchEvents = 'ontouchstart' in window && navigator.maxTouchPoints > 0;

  // Additional check for iPad on iOS 13+ which reports as MacIntel
  const isPadOS = platform === 'macintel' && hasIOSTouchEvents;

  return hasIOSUserAgent || hasIOSPlatform || isPadOS;
}

/**
 * Get iOS version from user agent
 * Returns null if not iOS or version cannot be determined
 */
export function getIOSVersion(): { major: number; minor: number; patch: number } | null {
  if (!isIOS()) return null;

  const match = navigator.userAgent.match(/OS (\d+)_(\d+)(?:_(\d+))?/);
  if (!match) return null;

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10) || 0,
    patch: Number.parseInt(match[3], 10) || 0,
  };
}

/**
 * Check if iOS version supports programmatic focus without user gesture
 * iOS 17.4+ removed the user gesture requirement
 */
export function supportsProgrammaticFocus(): boolean {
  const version = getIOSVersion();
  if (!version) return true; // Not iOS, assume it supports programmatic focus

  // iOS 17.4+ supports programmatic focus with rate limiting
  if (version.major > 17) return true;
  if (version.major === 17 && version.minor >= 4) return true;

  return false;
}

/**
 * Check if running in iOS Safari (not Chrome or other browsers)
 */
export function isIOSSafari(): boolean {
  if (!isIOS()) return false;

  const userAgent = navigator.userAgent.toLowerCase();

  // Chrome on iOS includes "crios"
  // Firefox on iOS includes "fxios"
  // Edge on iOS includes "edgios"
  const isChrome = userAgent.includes('crios');
  const isFirefox = userAgent.includes('fxios');
  const isEdge = userAgent.includes('edgios');

  // If it's iOS and not another browser, it's Safari
  return !isChrome && !isFirefox && !isEdge;
}

/**
 * Check if running in iOS Chrome
 */
export function isIOSChrome(): boolean {
  if (!isIOS()) return false;
  return navigator.userAgent.toLowerCase().includes('crios');
}

/**
 * Check if hardware keyboard is likely connected
 * This is a heuristic - not 100% reliable
 */
export function hasHardwareKeyboard(): boolean {
  // Check if visual viewport height is close to window height
  // When software keyboard is not showing and device is in portrait
  if (window.visualViewport) {
    const heightDiff = window.innerHeight - window.visualViewport.height;
    const isLandscape = window.innerWidth > window.innerHeight;

    // In portrait, if heights are very close, likely has hardware keyboard
    if (!isLandscape && heightDiff < 50) {
      // Additional check: see if focusing an input changes viewport
      return checkHardwareKeyboardHeuristic();
    }
  }

  return false;
}

/**
 * Heuristic check for hardware keyboard by testing focus behavior
 */
function checkHardwareKeyboardHeuristic(): boolean {
  try {
    // Create a temporary input to test
    const testInput = document.createElement('input');
    testInput.style.position = 'fixed';
    testInput.style.opacity = '0';
    testInput.style.pointerEvents = 'none';
    testInput.style.left = '-9999px';

    document.body.appendChild(testInput);

    // Store initial viewport
    const initialHeight = window.visualViewport?.height || window.innerHeight;

    // Focus the input
    testInput.focus();

    // Check if viewport changed
    const newHeight = window.visualViewport?.height || window.innerHeight;
    const viewportChanged = Math.abs(initialHeight - newHeight) > 50;

    // Clean up
    testInput.blur();
    testInput.remove();

    // If viewport didn't change much when focusing, likely has hardware keyboard
    return !viewportChanged;
  } catch (e) {
    logger.warn('Failed to check hardware keyboard heuristic:', e);
    return false;
  }
}

/**
 * Log iOS environment details for debugging
 */
export function logIOSEnvironment(): void {
  if (!isIOS()) {
    logger.log('Not running on iOS');
    return;
  }

  const version = getIOSVersion();
  const environment = {
    isIOS: true,
    version: version ? `${version.major}.${version.minor}.${version.patch}` : 'unknown',
    isSafari: isIOSSafari(),
    isChrome: isIOSChrome(),
    supportsProgrammaticFocus: supportsProgrammaticFocus(),
    hasVisualViewport: !!window.visualViewport,
    userAgent: navigator.userAgent,
    platform: navigator.platform,
  };

  logger.log('iOS Environment:', environment);
}

/**
 * Apply iOS-specific workarounds for input focus
 * Returns true if focus was successful
 */
export function focusInputWithIOSWorkaround(input: HTMLInputElement): boolean {
  if (!isIOS()) {
    input.focus();
    return document.activeElement === input;
  }

  const version = getIOSVersion();
  logger.log('Attempting iOS focus with version:', version);

  // For iOS 17.4+, can focus directly
  if (supportsProgrammaticFocus()) {
    input.focus();

    // iOS 17.4+ may need a small delay for keyboard animation
    if (document.activeElement !== input) {
      // Try again with the dummy value trick
      input.value = ' ';
      input.setSelectionRange(0, 1);
      input.focus();

      setTimeout(() => {
        input.value = '';
      }, 50);
    }

    return document.activeElement === input;
  }

  // For older iOS versions, need user gesture
  // This should be called within a user event handler

  // Make input temporarily more visible for iOS
  const originalOpacity = input.style.opacity;
  input.style.opacity = '0.01'; // iOS needs non-zero opacity

  // Focus with iOS-specific tricks
  input.setAttribute('readonly', 'readonly');
  input.focus();

  setTimeout(() => {
    input.removeAttribute('readonly');
    input.focus();

    // Set selection to trigger keyboard
    input.setSelectionRange(0, 0);

    // Restore original opacity
    if (originalOpacity) {
      input.style.opacity = originalOpacity;
    }
  }, 100);

  return document.activeElement === input;
}
