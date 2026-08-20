<div align="center">

![Spicy AMLL Player Banner](images/banner.png)

**A high-fidelity, glassmorphism-driven lyric and music player for the web, built on the Apple Music-like Lyrics library.**

[![License](https://img.shields.io/badge/License-AGPL--3.0-blue)](LICENSE)
[![Maintained](https://img.shields.io/badge/Maintained-Yes-brightgreen)](https://github.com/)

</div>

---

## Overview

Spicy AMLL Player is an unofficial remake of Apple Music's lyric experience for the web, bringing its glassmorphism aesthetics and precise, syllable-level lyric synchronization to a reactive, album-art-driven interface. It incorporates parts of [Spicy Lyrics](https://github.com/Spikerko/spicy-lyrics), on which it is based.

Despite the name, the project is not built on the Apple Music-like Lyrics (AMLL) component library — the name is coincidental.

<div align="center">

<img src="images/preview.gif" width="90%" style="border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" alt="Spicy AMLL Player Preview">

</div>

## Features

### Visual Interface

-   Glassmorphism UI with a semi-transparent interface that adapts to the current album art
-   Real-time color extraction for dynamic, track-reactive backgrounds
-   Support for animated, Apple Music-style video cover artwork

### Lyric Rendering

-   Word-level, syllable-accurate synchronization with scale and glow transitions
-   Full support for TTML syllable lyrics and classic LRC files
-   A simplified animation mode for a more minimal, focused presentation

### Playback and Metadata

-   Configurable lyric providers, including a Spicy API, Apple Music, Musixmatch, LRCLIB, and Netease, switchable at runtime
-   Robust ID3 and FLAC tag parsing for accurate track metadata
-   Optional Gibberish and Weeb display modes for alternate lyric presentation

## Getting Started

Spicy AMLL Player runs entirely in the browser. No installation is required.

1.  Visit the [official site](https://spicyamll.online).
2.  Drag and drop local audio files (MP3 or FLAC) along with optional `.ttml` lyric files, or play directly from the Apple Music catalog.
3.  The player will handle metadata parsing, lyric synchronization, and background rendering automatically.

## Legal and Credits

### San Francisco Pro Fonts

This project uses San Francisco Pro Fonts, obtained from the [Apple Developer Fonts](https://developer.apple.com/fonts/) portal. All rights belong to Apple Inc.

### License

Spicy AMLL Player is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE) for full terms.

### Acknowledgements

-   [Spicy Lyrics](https://github.com/Spikerko/spicy-lyrics) — portions of this project are based on and incorporate parts of Spicy Lyrics
-   All contributors and collaborators to this project
