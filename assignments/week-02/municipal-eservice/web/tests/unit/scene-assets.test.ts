import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SceneVideo, type SceneId } from '../../src/components/illustrations/SceneVideo.tsx';

const manifest = JSON.parse(readFileSync(new URL('../../public/illustrations/motion-manifest.json', import.meta.url), 'utf8')) as {
  assets: Record<string, { poster: string }>;
  login_illustrations: Record<string, { poster: string }>;
  active_scene_ids: SceneId[];
};

test('every active approved scene renders its manifest poster without an initial MP4 source', () => {
  for (const scene of manifest.active_scene_ids) {
    const approved = manifest.assets[scene] ?? manifest.login_illustrations[scene];
    assert.ok(approved, scene);
    const markup = renderToStaticMarkup(createElement(SceneVideo, { scene }));
    const poster = markup.match(/<img\b[^>]*>/)?.[0];
    const video = markup.match(/<video\b[^>]*>/)?.[0];
    assert.ok(poster?.includes(`src="/illustrations/${approved.poster}"`), `${scene}: the approved poster remains visible`);
    assert.ok(poster?.includes('alt=""'), `${scene}: surrounding page text provides the illustration meaning`);
    assert.ok(video, `${scene}: the client can opt into playback`);
    assert.doesNotMatch(video, /\ssrc=|\sautoplay(?:=|\s|>)/i, `${scene}: preference and visibility must be known before MP4 loading`);
    assert.match(video, /preload="none"/, scene);
    assert.match(video, /muted=""/, scene);
    assert.match(video, /loop=""/, scene);
    assert.match(video, /playsInline=""/i, scene);
    assert.match(markup, /<button\b[^>]*aria-label="เล่นภาพเคลื่อนไหว"[^>]*disabled=""/, `${scene}: the control waits for client preference detection`);
  }
});

test('scene context and placement classes survive server rendering for a full-bleed hero', () => {
  const markup = renderToStaticMarkup(createElement(SceneVideo, { scene: '1A', context: 'hero', className: 'welcome-scene' }));
  assert.match(markup, /class="scene-frame scene-frame--hero welcome-scene"/);
  assert.match(markup, /data-motion-scene="1A"/);
  assert.match(markup, /<video\b[^>]*aria-hidden="true"/);
});
