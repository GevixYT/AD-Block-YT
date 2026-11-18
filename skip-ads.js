(() => {
  'use strict';

  const primaryPlayerSelector = '#movie_player.html5-video-player';
  const skipSelector = '.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button';
  const closeSelector = '.ytp-ad-overlay-close-button';
  const staticAdSelector = '[id^="video-interstitial-buttoned-centered:"], .ytp-ad-action-interstitial';
  const staticSkipSelector = '[id^="skip-button:"], .ytp-ad-skip-button-slot, ' + skipSelector;
  const clickableAdSelector = '.ytp-ad-component--clickable';
  const adIndicatorSelector = [
    '[id^="ad-badge:"]',
    '.ytp-ad-player-overlay-layout__ad-info-container',
    '.ytp-ad-preview-container',
    '.ytp-ad-duration-remaining',
    '.ytp-ad-text'
  ].join(', ');
  const adPodSelector = '.ytp-ad-pod-index';
  const videoSelector = 'video.html5-main-video';
  const mediaEvents = [
    'loadstart', 'emptied', 'loadedmetadata', 'durationchange', 'playing',
    'timeupdate', 'ratechange', 'waiting', 'stalled', 'seeking', 'seeked', 'pause', 'ended', 'error'
  ];
  const staticAdEvents = ['animationend', 'transitionend'];
  const playbackInterrupted = new Set(['waiting', 'stalled', 'seeking', 'pause', 'ended', 'error']);
  const buttonGraceMs = 400;
  const adPlaybackRate = 8;
  let player;
  let ad;
  let staticAttempt;
  let videoSkipAttempt;
  let closedOverlay;
  let checkTimer;
  let startupPreview;
  let unavailableThumbnail;

  function isVisible(element, needsArea = true) {
    const rect = element.getBoundingClientRect();
    if (!element.getClientRects().length || (needsArea && (rect.width <= 0 || rect.height <= 0))) return false;
    if (typeof element.checkVisibility === 'function') {
      return element.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    }
    const style = getComputedStyle(element);
    return style.visibility === 'visible' && style.opacity !== '0';
  }

  function findButton(root, selector) {
    const buttonSelector = 'button, [role="button"]';
    for (const match of root.querySelectorAll(selector)) {
      const button = match.matches(buttonSelector) ? match : match.querySelector(buttonSelector);
      if (button && !button.matches(':disabled') &&
          !button.closest('[aria-disabled="true"], [aria-hidden="true"], [inert]') &&
          isVisible(button)) return button;
    }
  }

  function restoreRate() {
    if (ad?.originalRate === undefined) return;
    if (ad.video.playbackRate === adPlaybackRate) ad.video.playbackRate = ad.originalRate;
    ad.originalRate = undefined;
  }

  function clearAd() {
    restoreRate();
    ad = undefined;
  }

  function queueCheck() {
    if (checkTimer !== undefined) return;
    checkTimer = setTimeout(() => {
      checkTimer = undefined;
      checkPlayer();
    }, 0);
  }

  function clearStartupPreview() {
    startupPreview?.image.remove();
    startupPreview = undefined;
  }

  function updateStartupPreview() {
    const video = player.querySelector(videoSelector);
    // YouTube can render the spinner inside a zero-height wrapper.
    const spinner = player.querySelector('.ytp-spinner');
    if (!video || video.paused || video.currentTime > 0.04 ||
        video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA ||
        !spinner || !isVisible(spinner, false) || player.classList.contains('ad-interrupting') ||
        location.pathname !== '/watch') {
      clearStartupPreview();
      return;
    }

    const videoId = new URLSearchParams(location.search).get('v');
    if (startupPreview?.videoId === videoId && startupPreview.image.isConnected) return;
    clearStartupPreview();
    if (!videoId || !/^[\w-]{11}$/.test(videoId) || videoId === unavailableThumbnail) return;

    const image = document.createElement('img');
    image.className = 'ad-block-yt-startup-preview';
    image.alt = '';
    image.hidden = true;
    image.addEventListener('load', () => { image.hidden = false; }, { once: true });
    image.addEventListener('error', () => {
      unavailableThumbnail = videoId;
      if (startupPreview?.image === image) clearStartupPreview();
    }, { once: true });
    image.src = 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';
    startupPreview = { image, videoId };
    player.append(image);
  }

  function checkPlayer() {
    if (!player?.isConnected) return;

    const closeButton = findButton(player, closeSelector);
    if (closeButton !== closedOverlay) {
      closedOverlay = closeButton;
      closeButton?.click();
    }

    // Static interstitials can have a Skip button without playing an ad video.
    const staticCards = Array.from(player.querySelectorAll(staticAdSelector)).filter(card =>
      !card.closest('[aria-hidden="true"], [inert]') && isVisible(card)
    );
    if (staticCards.length) {
      clearStartupPreview();
      videoSkipAttempt = undefined;
      clearAd();
      let button;
      for (const card of staticCards) {
        button = findButton(card, staticSkipSelector);
        if (button) break;
      }

      const clickable = !!button?.closest(clickableAdSelector);
      if (button && (button !== staticAttempt?.button || (clickable && !staticAttempt.clickable))) {
        staticAttempt = { button, clickable };
        button.click();
      } else if (!button) {
        staticAttempt = undefined;
      }
      return;
    }
    staticAttempt = undefined;

    if (!player.classList.contains('ad-showing')) {
      updateStartupPreview();
      videoSkipAttempt = undefined;
      clearAd();
      return;
    }

    clearStartupPreview();
    const video = player.querySelector(videoSelector);
    const pod = player.querySelector(adPodSelector)?.textContent.trim() ?? '';
    const source = video?.currentSrc;
    if (!ad || ad.video !== video || ad.pod !== pod || ad.source !== source) {
      clearAd();
      ad = { video, pod, source };
    }

    const now = performance.now();
    const skipButton = findButton(player, skipSelector);
    if (skipButton && (skipButton !== videoSkipAttempt?.button || pod !== videoSkipAttempt.pod)) {
      videoSkipAttempt = { button: skipButton, pod, until: now + buttonGraceMs };
      if (ad.originalRate !== undefined) {
        restoreRate();
        ad.accelerated = false;
      }
      ad.lastTime = undefined;
      skipButton.click();
      setTimeout(queueCheck, buttonGraceMs);
      return;
    }
    if (!skipButton) videoSkipAttempt = undefined;
    if (!video || now < (videoSkipAttempt?.until ?? 0)) return;

    const hasAdIndicator = Array.from(player.querySelectorAll(adIndicatorSelector)).some(isVisible);
    if (!hasAdIndicator || video.paused || video.seeking ||
        video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA ||
        !Number.isFinite(video.duration) || video.currentTime >= video.duration) {
      ad.lastTime = undefined;
      restoreRate();
      return;
    }

    // A seekable range does not guarantee that the end has been buffered.
    // Speed up only after this ad has advanced on its own.
    const time = video.currentTime;
    // A stale ad class can briefly outlast the ad on the same video element.
    if (time <= 1) ad.sawStart = true;
    if (ad.lastTime !== undefined && time < ad.lastTime) restoreRate();
    if (ad.sawStart && time > ad.lastTime && video.playbackRate < adPlaybackRate && !ad.accelerated) {
      ad.originalRate = video.playbackRate;
      ad.accelerated = true;
      video.playbackRate = adPlaybackRate;
    }
    ad.lastTime = time;
  }

  const playerObserver = new MutationObserver(queueCheck);

  function onMediaChange(event) {
    if (!event.target.matches?.(videoSelector)) return;
    if (event.target === ad?.video) {
      if (event.type === 'loadstart' || event.type === 'emptied') {
        clearAd();
      } else if (playbackInterrupted.has(event.type)) {
        ad.lastTime = undefined;
        restoreRate();
      }
    }
    if (ad || startupPreview || player?.classList.contains('ad-showing') || event.type === 'waiting') queueCheck();
  }

  function onStaticAdAnimation(event) {
    if (event.target.closest?.(staticAdSelector)) queueCheck();
  }

  function bindPlayer() {
    if (player?.isConnected && player.matches(primaryPlayerSelector)) return;
    const nextPlayer = document.querySelector(primaryPlayerSelector) ??
      document.querySelector('.html5-video-player') ?? undefined;
    if (nextPlayer === player) return;
    clearStartupPreview();
    clearAd();
    staticAttempt = undefined;
    videoSkipAttempt = undefined;
    closedOverlay = undefined;
    playerObserver.disconnect();
    for (const type of mediaEvents) player?.removeEventListener(type, onMediaChange, true);
    for (const type of staticAdEvents) player?.removeEventListener(type, onStaticAdAnimation, true);
    player = nextPlayer;
    if (!player) return;
    playerObserver.observe(player, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'disabled', 'aria-disabled', 'aria-hidden', 'inert']
    });
    for (const type of mediaEvents) player.addEventListener(type, onMediaChange, true);
    for (const type of staticAdEvents) player.addEventListener(type, onStaticAdAnimation, true);
    queueCheck();
  }

  new MutationObserver(bindPlayer).observe(document, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => {
    clearStartupPreview();
    clearAd();
  });
  bindPlayer();
})();
