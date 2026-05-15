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

### Development

```sh
cd scriptable
npm install
npm run typecheck
npm run build
```

## xbar

An `xbar` plugin for fetching and displaying allergen/pollen data on macOS.

![screenshot](screenshot.png)

### Setup

1. Install [Node.js](https://nodejs.org/)
2. Install [xbar](https://xbarapp.com/)
3. Place [`xbar/pollen.5m.ts`](xbar/pollen.5m.ts) in your `xbar` plugins directory
   ```sh
   cp xbar/pollen.5m.ts ~/Library/Application\ Support/xbar/plugins/pollen.5m.ts
   ```
4. Make the file executable
   ```sh
   chmod +x ~/Library/Application\ Support/xbar/plugins/pollen.5m.ts
   ```

### Development

```sh
cd xbar
npm install
npm run typecheck
```
