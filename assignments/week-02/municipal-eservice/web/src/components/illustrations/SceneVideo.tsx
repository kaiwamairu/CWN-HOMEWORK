'use client';

import { useEffect, useRef, useState } from 'react';
import manifest from '../../../public/illustrations/motion-manifest.json';

const sceneAssets = {
  '1A': manifest.assets['1A'],
  '3A': manifest.assets['3A'],
  'LOGIN-CITIZEN': manifest.login_illustrations['LOGIN-CITIZEN'],
  'LOGIN-STAFF': manifest.login_illustrations['LOGIN-STAFF'],
} as const;

export type SceneId = keyof typeof sceneAssets;

export interface SceneVideoProps {
  scene: SceneId;
  context?: 'entry' | 'hero';
  className?: string;
}

type PlaybackState = 'paused' | 'starting' | 'playing' | 'failed';

export function SceneVideo({ scene, context = 'entry', className }: SceneVideoProps) {
  // Changing the approved scene gets a fresh playback preference and releases the old media.
  return <SceneVideoFrame key={scene} scene={scene} context={context} className={className} />;
}

function SceneVideoFrame({ scene, context, className }: Required<Pick<SceneVideoProps, 'scene' | 'context'>> & Pick<SceneVideoProps, 'className'>) {
  const asset = sceneAssets[scene];
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const toggleRef = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);
  const [playback, setPlayback] = useState<PlaybackState>('paused');
  const [hasFrames, setHasFrames] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const frame = frameRef.current;
    if (!video || !frame) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let active = true;
    let visible = false;
    let failed = false;
    let optedIn = false;
    let wantsPlayback = !reducedMotion.matches;
    let pendingPlay = false;
    let playAttempt = 0;

    const canPlay = () => active && !failed && wantsPlayback && visible && !document.hidden
      && (!reducedMotion.matches || optedIn);

    function pause() {
      playAttempt += 1;
      pendingPlay = false;
      video!.pause();
      if (active) setPlayback(failed ? 'failed' : 'paused');
    }

    function releaseSource() {
      pause();
      video!.removeAttribute('src');
      // load() aborts any pending request and frees the decoder, including on unmount.
      video!.load();
      if (active) setHasFrames(false);
    }

    function updatePlayback() {
      if (!canPlay()) {
        pause();
        return;
      }
      if (pendingPlay) return;
      if (!video!.paused) {
        setPlayback('playing');
        return;
      }

      // There is deliberately no src in server markup or the first client render.
      // Only a known motion preference plus viewport visibility can reach this line.
      if (!video!.hasAttribute('src')) video!.src = `/illustrations/${asset.video}`;
      video!.muted = true;
      pendingPlay = true;
      const attempt = ++playAttempt;
      setPlayback('starting');
      void video!.play().then(() => {
        if (!active || !canPlay()) {
          video!.pause();
          return;
        }
        if (attempt !== playAttempt) return;
        pendingPlay = false;
        setHasFrames(true);
        setPlayback(video!.paused ? 'paused' : 'playing');
      }).catch(() => {
        if (!active || attempt !== playAttempt) return;
        pendingPlay = false;
        // An autoplay policy rejection is recoverable through explicit Play.
        wantsPlayback = false;
        video!.pause();
        setHasFrames(false);
        setPlayback('paused');
      });
    }

    function onPlaying() {
      if (!canPlay()) {
        pause();
        return;
      }
      setHasFrames(true);
      setPlayback('playing');
    }

    function onPause() {
      if (active) setPlayback(failed ? 'failed' : 'paused');
    }

    function onError() {
      if (!active || !video!.hasAttribute('src')) return;
      failed = true;
      wantsPlayback = false;
      releaseSource();
      setPlayback('failed');
    }

    function onMotionPreferenceChange() {
      // A preference change always stops motion and clears the prior explicit opt-in.
      optedIn = false;
      wantsPlayback = false;
      releaseSource();
    }

    function checkViewport() {
      const rect = frame!.getBoundingClientRect();
      visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
        && rect.top < window.innerHeight && rect.left < window.innerWidth;
      updatePlayback();
    }

    toggleRef.current = () => {
      if (failed) return;
      if (pendingPlay || !video.paused) {
        wantsPlayback = false;
      } else {
        wantsPlayback = true;
        optedIn = true;
      }
      updatePlayback();
    };

    video.muted = true;
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    video.addEventListener('error', onError);
    reducedMotion.addEventListener('change', onMotionPreferenceChange);
    document.addEventListener('visibilitychange', updatePlayback);
    setReady(true);

    let observer: IntersectionObserver | undefined;
    if (typeof window.IntersectionObserver === 'function') {
      observer = new IntersectionObserver((entries) => {
        const entry = entries.find((item) => item.target === frame);
        if (!entry || !active) return;
        visible = entry.isIntersecting && entry.intersectionRatio >= 0.02;
        updatePlayback();
      }, { threshold: 0.02 });
      observer.observe(frame);
    } else {
      // Older browsers retain viewport pausing without preloading hidden scenes.
      checkViewport();
      window.addEventListener('scroll', checkViewport, true);
      window.addEventListener('resize', checkViewport);
    }

    return () => {
      active = false;
      toggleRef.current = null;
      observer?.disconnect();
      window.removeEventListener('scroll', checkViewport, true);
      window.removeEventListener('resize', checkViewport);
      document.removeEventListener('visibilitychange', updatePlayback);
      reducedMotion.removeEventListener('change', onMotionPreferenceChange);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('error', onError);
      releaseSource();
    };
  }, [asset]);

  const playing = playback === 'playing' || playback === 'starting';
  const label = playback === 'failed' ? 'แสดงภาพนิ่ง' : playing ? 'หยุดภาพเคลื่อนไหว' : 'เล่นภาพเคลื่อนไหว';

  return (
    <div
      ref={frameRef}
      className={`scene-frame scene-frame--${context}${className ? ` ${className}` : ''}`}
      data-motion-scene={scene}
      data-motion-state={playback}
      data-has-frames={hasFrames ? 'true' : 'false'}
    >
      <img className="scene-poster" src={`/illustrations/${asset.poster}`} width={asset.width} height={asset.height} alt="" aria-hidden="true" decoding="async" />
      <video ref={videoRef} className="scene-video" poster={`/illustrations/${asset.poster}`} muted loop playsInline preload="none" aria-hidden="true" tabIndex={-1} />
      <button
        type="button"
        className="scene-toggle"
        aria-label={label}
        aria-pressed={playing}
        title={label}
        disabled={!ready || playback === 'failed'}
        onClick={() => toggleRef.current?.()}
      >
        <span aria-hidden="true">{playback === 'failed' ? '▧' : playing ? 'Ⅱ' : '▶'}</span>
      </button>
    </div>
  );
}
