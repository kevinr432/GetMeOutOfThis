# GetMeOutOfThis

A React web app that rings with a fake incoming call after your phone has been lying face down for a set number of minutes.

## How it works

1. Enter how many minutes to wait and the caller name to show.
2. Tap **Start**. iPhone asks for Motion & Orientation access; allow it.
3. Place the phone face down. The countdown starts. Picking the phone up before it finishes cancels it.
4. When time is up, a two-tone ring plays and the screen shows an incoming call. **Accept** shows a call in progress with a running timer, and **End** or **Decline** goes back to waiting.

Face down is read from the phone's tilt sensor (`deviceorientation`, where |beta| is above 150°) and must hold for 1 second before it counts.

## Notes for iPhone

- The page must be served over https, which Vercel provides. Motion sensors don't work over plain http.
- Keep the page open and the phone unlocked. The app keeps the screen awake while it's running.
- The app asks iOS to play sound even with the silent switch on (iOS 17+). Turn the volume up.
- iPhone Safari does not support vibration from web pages, so there is sound only.

## Run locally

```
npm install
npm run dev
```

## Deploy

Push to GitHub, then in Vercel choose **Add New → Project**, import the repo, and keep the Vite defaults (build `npm run build`, output `dist`).
