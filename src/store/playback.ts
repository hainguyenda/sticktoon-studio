"use client";

import { create } from "zustand";

interface PlaybackState {
  time: number;
  playing: boolean;
  exporting: boolean;
  exportProgress: number;
  set: (p: Partial<Omit<PlaybackState, "set">>) => void;
}

export const usePlayback = create<PlaybackState>((set) => ({
  time: 0,
  playing: false,
  exporting: false,
  exportProgress: 0,
  set: (p) => set(p),
}));
