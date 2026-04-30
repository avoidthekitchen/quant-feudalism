import * as Phaser from "phaser";

export const MUSIC_KEYS = {
  arena: "music-arena-high-scores-only",
  outside: "music-outside-midnight-perimeter",
} as const;

export type MusicMode = keyof typeof MUSIC_KEYS;

type ManagedMusic = Phaser.Sound.BaseSound & {
  volume: number;
};

const MUSIC_VOLUME = 0.34;
const MUSIC_FADE_MS = 450;

let currentMode: MusicMode | null = null;
let currentTrack: ManagedMusic | null = null;
let unlockRetryMode: MusicMode | null = null;

export function playBackgroundMusic(scene: Phaser.Scene, mode: MusicMode): void {
  if (currentMode === mode && currentTrack && !currentTrack.pendingRemove) {
    if (!currentTrack.isPlaying && !currentTrack.isPaused) {
      playOrRetryOnUnlock(scene, mode, currentTrack);
    }
    return;
  }

  const previousTrack = currentTrack;
  currentMode = mode;

  const nextTrack = scene.sound.add(MUSIC_KEYS[mode], {
    loop: true,
    volume: 0,
  }) as ManagedMusic;

  currentTrack = nextTrack;
  if (!playOrRetryOnUnlock(scene, mode, nextTrack)) {
    nextTrack.volume = MUSIC_VOLUME;
  }

  scene.tweens.add({
    targets: nextTrack,
    volume: MUSIC_VOLUME,
    duration: MUSIC_FADE_MS,
    ease: "Sine.easeOut",
  });

  if (!previousTrack || previousTrack.pendingRemove) {
    return;
  }

  scene.tweens.add({
    targets: previousTrack,
    volume: 0,
    duration: MUSIC_FADE_MS,
    ease: "Sine.easeIn",
    onComplete: () => {
      previousTrack.stop();
      previousTrack.destroy();
    },
  });
}

function playOrRetryOnUnlock(scene: Phaser.Scene, mode: MusicMode, track: ManagedMusic): boolean {
  const started = track.play();
  if (started || !scene.sound.locked || unlockRetryMode === mode) {
    return started;
  }

  unlockRetryMode = mode;
  scene.sound.once(Phaser.Sound.Events.UNLOCKED, () => {
    unlockRetryMode = null;
    if (currentMode === mode && currentTrack === track && !track.pendingRemove && !track.isPlaying) {
      track.play();
    }
  });

  return false;
}
