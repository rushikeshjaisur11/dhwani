import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from './settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    // Reset Zustand store state before each test if needed
    // Assuming the initial state has 'plasma' or some default for voiceVisualizerStyle
    useSettingsStore.setState({ voiceVisualizerStyle: 'bars' });
  });

  it('initializes with a voice visualizer style', () => {
    const state = useSettingsStore.getState();
    expect(state.voiceVisualizerStyle).toBeDefined();
  });

  it('setVoiceVisualizerStyle updates the style correctly', () => {
    const { setVoiceVisualizerStyle } = useSettingsStore.getState();
    
    // Change to neon
    setVoiceVisualizerStyle('neon');
    expect(useSettingsStore.getState().voiceVisualizerStyle).toBe('neon');

    // Change to particles
    setVoiceVisualizerStyle('particles');
    expect(useSettingsStore.getState().voiceVisualizerStyle).toBe('particles');
  });

  it('setTheme updates the theme correctly', () => {
    const { setTheme } = useSettingsStore.getState();
    
    setTheme('dark');
    expect(useSettingsStore.getState().theme).toBe('dark');
  });
});
