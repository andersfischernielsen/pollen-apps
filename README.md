# Pollen

Small utilities to help manage hayfever in Denmark.

All data is fetched from [Astma-Allergi Danmark](https://www.astma-allergi.dk/).

## Scriptable

A Scriptable script for fetching and displaying allergen/pollen data on iOS.

![screenshot2](screenshot2.jpg)

1. Install [Scriptable](https://scriptable.app/)
2. Create a new Widget in Scriptable
3. Copy the contents of [`scriptable/pollen.js`](scriptable/pollen.js) into the created widget
4. Add the Widget to the iOS home screen

## xbar

An `xbar` plugin for fetching and displaying allergen/pollen data on macOS.

![screenshot](screenshot.png)

### Setup

1. Install [Node.js](https://nodejs.org/)
2. Install [xbar](https://xbarapp.com/)
3. Place [`xbar/pollen.5m.js`](xbar/pollen.5m.js) in your `xbar` plugins directory
   ```sh
   cp xbar/pollen.5m.js ~/Library/Application\ Support/xbar/plugins/pollen.5m.js
   ```
4. Make the file executable
   ```sh
   chmod +x ~/Library/Application\ Support/xbar/plugins/pollen.5m.js
   ```

### Development

```sh
cd xbar
npm install
npm run build   # rebuilds pollen.5m.js from source
npm run typecheck
```
