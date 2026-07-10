# Guardian

A modern, endless remake of the classic arcade game *Defender*. Rescue humanoids,
fight off an escalating alien assault, and chase a high score — the game never
ends, it just keeps getting harder until it isn't survivable anymore.

Built with Electron. All graphics are drawn on canvas, all sound effects and the
chiptune soundtrack are synthesized live with the Web Audio API — no art or
audio assets.

## Controls

- **Move**: WASD / Arrow keys, mouse (ship steers toward the cursor), or a gamepad's left stick
- **Fire**: Space, left mouse button, or gamepad face button
- **Smart Bomb**: `B` / gamepad B button
- **Hyperspace**: `H` / gamepad bumper
- **Pause**: `Escape`

All three control schemes work simultaneously — pick whichever's in your hands.

## Development

```
npm install
npm start   # run the app
npm test    # run the logic test suite
```

## Building installers

```
npm run dist   # builds for the current platform via electron-builder
```

Tagged pushes (`vX.Y.Z`) trigger `.github/workflows/release.yml`, which builds
macOS (`.dmg`, arm64+x64), Linux (`.AppImage`, arm64+x64), and Windows (`.exe`,
x64+arm64) installers and publishes them to a GitHub Release.

### macOS: "Guardian is damaged and can't be opened"

The mac build is ad-hoc signed (no paid Apple Developer ID, so it isn't
notarized). macOS quarantines anything downloaded from a browser and refuses
to run it until you clear that flag once:

```
xattr -cr /Applications/Guardian.app
```
