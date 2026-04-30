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
      const track = currentTrack;
      if (playOrRetryOnUnlock(scene, mode, track, () => fadeIn(scene, track))) {
        fadeIn(scene, track);
      }
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
  cleanupCurrentTrackOnShutdown(scene, mode, nextTrack);
  if (playOrRetryOnUnlock(scene, mode, nextTrack, () => fadeIn(scene, nextTrack))) {
    fadeIn(scene, nextTrack);
  }

  if (!previousTrack || previousTrack.pendingRemove) {
    return;
  }

  fadeOutAndDestroy(scene, previousTrack);
}

function fadeIn(scene: Phaser.Scene, track: ManagedMusic | null): void {
  if (!track || track.pendingRemove) {
    return;
  }

  scene.tweens.add({
    targets: track,
    volume: MUSIC_VOLUME,
    duration: MUSIC_FADE_MS,
    ease: "Sine.easeOut",
  });
}

function fadeOutAndDestroy(scene: Phaser.Scene, track: ManagedMusic): void {
  const destroyTrack = () => {
    if (track.pendingRemove) {
      return;
    }
    track.stop();
    track.destroy();
  };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroyTrack);
  scene.tweens.add({
    targets: track,
    volume: 0,
    duration: MUSIC_FADE_MS,
    ease: "Sine.easeIn",
    onComplete: () => {
      scene.events.off(Phaser.Scenes.Events.SHUTDOWN, destroyTrack);
      destroyTrack();
    },
  });
}

function cleanupCurrentTrackOnShutdown(
  scene: Phaser.Scene,
  mode: MusicMode,
  track: ManagedMusic,
): void {
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    if (currentMode !== mode || currentTrack !== track || track.pendingRemove) {
      return;
    }
    track.stop();
    track.destroy();
    currentMode = null;
    currentTrack = null;
  });
}

function playOrRetryOnUnlock(
  scene: Phaser.Scene,
  mode: MusicMode,
  track: ManagedMusic,
  onStarted: () => void,
): boolean {
  const started = track.play();
  if (started) {
    return true;
  }

  if (!scene.sound.locked || unlockRetryMode === mode) {
    return false;
  }

  unlockRetryMode = mode;
  scene.sound.once(Phaser.Sound.Events.UNLOCKED, () => {
    unlockRetryMode = null;
    if (currentMode === mode && currentTrack === track && !track.pendingRemove && !track.isPlaying) {
      if (track.play()) {
        onStarted();
      }
    }
  });

  return false;
}
