(() => {
  'use strict';

  const adFields = ['adPlacements', 'adSlots', 'playerAds'];
  const adFieldInJson = /"(?:adPlacements|adSlots|playerAds)"\s*:/;

  function ownValue(object, property) {
    if (object && typeof object === 'object') {
      return Object.getOwnPropertyDescriptor(object, property)?.value;
    }
  }

  function filterPlayerAds(response) {
    const video = ownValue(response, 'videoDetails');
    const playability = ownValue(response, 'playabilityStatus');
    if (typeof ownValue(video, 'videoId') !== 'string' ||
        typeof ownValue(playability, 'status') !== 'string') return response;

    for (const field of adFields) {
      const descriptor = Object.getOwnPropertyDescriptor(response, field);
      if (descriptor?.configurable && Array.isArray(descriptor.value)) {
        Reflect.deleteProperty(response, field);
      }
    }
    return response;
  }

  const key = 'ytInitialPlayerResponse';
  const initial = Object.getOwnPropertyDescriptor(window, key);
  if (!initial || (initial.configurable && initial.writable)) {
    let value = filterPlayerAds(initial?.value);
    Object.defineProperty(window, key, {
      configurable: true,
      enumerable: initial?.enumerable ?? true,
      get() { return value; },
      set(response) { value = filterPlayerAds(response); }
    });
  }

  // YouTube also decodes player snapshots when navigating inside the same page.
  const readJsonText = JSON.parse;
  JSON.parse = function parse(text, reviver) {
    const parsed = Reflect.apply(readJsonText, this, arguments);
    if (typeof text === 'string' && typeof reviver !== 'function' && adFieldInJson.test(text)) {
      filterPlayerAds(parsed);
      filterPlayerAds(ownValue(parsed, 'playerResponse'));
    }
    return parsed;
  };

  const responsePrototype = Response.prototype;
  const readJson = responsePrototype.json;
  const readUrl = Object.getOwnPropertyDescriptor(responsePrototype, 'url')?.get;
  const endpoint = location.origin + '/youtubei/v1/player';
  if (!readUrl) return;

  responsePrototype.json = function json() {
    let url;
    try {
      url = Reflect.apply(readUrl, this, []);
    } catch {
      return Reflect.apply(readJson, this, arguments);
    }
    const parsed = Reflect.apply(readJson, this, arguments);
    return url === endpoint || url.startsWith(endpoint + '?')
      ? parsed.then(filterPlayerAds)
      : parsed;
  };
})();
