import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock the Electron IPC API that React components rely on globally
window.api = {
  electronIpcSend: vi.fn(),
  electronIpcSendSync: vi.fn(),
  electronIpcInvoke: vi.fn().mockResolvedValue(null),
  electronIpcOn: vi.fn(),
  electronIpcOnce: vi.fn(),
  electronIpcRemoveListener: vi.fn(),
  electronIpcRemoveAllListeners: vi.fn(),
  isMac: false,
  isWindows: true,
  isLinux: false,
} as any;

window.electronAPI = {
  getSttConfig: vi.fn().mockResolvedValue({ success: true }),
  openExternal: vi.fn(),
  showSettingsWindow: vi.fn(),
} as any;

// Mock other typical browser globals that might be missing in jsdom or need mocking
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
