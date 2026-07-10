# Guardian

A modern, endless remake of the classic arcade game *Defender*. Rescue humanoids,
fight off an escalating alien assault, and chase a high score — the game never
ends, it just keeps getting harder until it isn't survivable anymore.

Built with Electron. All graphics are drawn on canvas, all sound effects and the
chiptune soundtrack are synthesized live with the Web Audio API — no art or
audio assets.

## Controls

- **Move**: WASD / Arrow keys or a gamepad's left stick (mouse steering is available too, see below)
- **Fire**: Space, left mouse button, or gamepad face button
- **Toggle Mouse Steering**: `M` — off by default, since idle mouse jitter otherwise fights keyboard input; turn it on if you want the ship to steer toward the cursor
- **Smart Bomb** (clears the screen): `B` / gamepad B button
- **Drop Bomb** (falling, blast-radius bomb — good against ground tanks/turrets): `G` / gamepad X button
- **Hyperspace**: `H` / gamepad bumper
- **Pause**: `Escape`

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
