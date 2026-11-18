# AD-Block YT

AD-Block YT is an independent Chrome extension that filters YouTube ads. It blocks selected ad requests, hides sponsored placements, and uses the player's Skip controls for recognized ads, including static ad cards.

## Install on Chrome

1. Download the extension ZIP from the [latest release](https://github.com/GevixYT/AD-Block-YT/releases/latest) and extract it to a folder you can keep.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Select **Load unpacked** and choose the folder containing `manifest.json`.
4. Refresh any open YouTube tabs.

If you downloaded the source code, you can select the repository folder directly in step 3. For a manual update, extract the new release into the same folder, then click **Reload** on the extension card and refresh YouTube.

## Playback

At the start of a video, a loading spinner can remain visible for several seconds. The extension displays the current video's thumbnail while the player waits and removes it as playback starts. Ad delivery and playback behavior can vary by video and session.

## Permissions and data

Filtering runs in Chrome on YouTube pages and YouTube's privacy-enhanced embeds. Chrome's `declarativeNetRequest` permission enables the bundled ad-blocking rules. During startup buffering, the extension can load the current video's preview image from YouTube's image host, `i.ytimg.com`.

## Report playback issues

Include the Chrome version, the extension version, and the steps to reproduce. A public example video helps reproduce the issue.
