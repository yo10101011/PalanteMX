# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Read `AGENTS.md` too — it holds the Expo-specific rules (Expo SDK 57: fetch versioned docs before touching Expo APIs, always `npx expo install`, never hand-edit `ios/`/`android/`, routes live in `src/app/`).

The developer works in Spanish: reply in Spanish. All UI text, identifiers, Firestore collection/field names and comments are Spanish — keep new code consistent with that.

## Commands

App (repo root, npm — `package-lock.json`, no bun):

```bash
npx expo start          # dev server (native modules like camera, local-auth, sensors need a dev build, not Expo Go)
npx tsc --noEmit        # typecheck — currently passes
npx expo lint           # ESLint is NOT installed yet; the first run installs/configures it (that modifies package.json)
```

There are no tests in this project.

KYC worker (`backend/kyc-worker/`, Cloudflare Worker, excluded from the root tsconfig):

```bash
npm run dev             # wrangler dev — needs .dev.vars (copy .dev.vars.example: OCR_KEY, FACE_KEY, FACE_SECRET)
npm run deploy          # wrangler deploy; secrets are set with `npx wrangler secret put <NAME>`
npm run typecheck
```

The app reaches the worker through `EXPO_PUBLIC_KYC_API_URL` in `.env`.

The project is not a git repository yet.

## Architecture

**Product:** job marketplace for trades in Mexico. Two user roles — *Trabajador* (worker) and *Contratista* (employer) — plus a hidden admin panel.

**Routing:** `src/app/_layout.tsx` is a header-less `Stack`. There is no tab navigator: each screen draws its own fake bottom bar and jumps between screens with `router.push(... as any)`. Screens switch internal "tabs" with a `pestañaActiva` state string; `mensajes.tsx` passes `params.tab` to the dashboards (only `dashboard-trabajador` reads it).

- `index.tsx` login → after `signInWithEmailAndPassword`, routes to `/dashboard-contratista` if `Contratistas/{uid}` exists, else `/dashboard-trabajador`. Login by username/phone first queries both collections to resolve the email.
- Worker flow: `dashboard-trabajador` ⇄ `feed` (job board + my applications) ⇄ `mensajes`.
- Contratista flow: `dashboard-contratista` ⇄ `mensajes`.
- `admin.tsx` is reached via a hardcoded PIN in `index.tsx`, with no Firebase auth.
- `src/app/explore.tsx`, everything in `src/components/`, `src/hooks/`, `src/constants/theme.ts`, `src/global.css` and `scripts/reset-project.js` are leftover create-expo-app template code that no real screen uses.

**Screens are monoliths:** each file in `src/app/` contains all its state, Firebase calls, modals and `StyleSheet` inline (the dashboards are 1000+ lines). Much logic is copy-pasted across screens: `subirFotoACloudinary`, the report (`Quejas_Soporte`) and review modals/handlers, `eliminarCuenta`/`cerrarSesion`, reverse geocoding, the bottom nav. When fixing one copy, check the others.

**Firebase** (`firebaseConfig.js` at repo root, imported as `'../../firebaseConfig'`): exports `auth` (AsyncStorage persistence), `db` and `storage` (`storage` is unused). No `onAuthStateChanged` anywhere; screens read `auth.currentUser` on mount. Firestore collections:

- `Usuarios` = workers, `Contratistas` = employers. The role is implied by which collection holds `{uid}`, and is duplicated in `rol_usuario`. Screens fall back to the other collection if the doc is missing.
- A worker's portfolio (`portafolio[]`) and each work's daily log (`bitacora[]`) are arrays inside the worker's user doc, keyed by `id_obra` but matched to vacancies by **title** (`titulo === titulo_vacante`).
- `Vacantes` (`id_contratista`, `cupo_total`/`cupo_actual`, `estado` 'Activa'|'Cerrada'), `Postulaciones` (`id_trabajador`, `id_vacante`, `estado` 'Pendiente'|'Aceptada (En Proceso)'|'Rechazada'; contratista "direct hire" creates these with a different shape).
- `Chats` (`usuarios_ids[]`, denormalized `datos_usuarios`, `leido`, `bloqueado`) with subcollection `Mensajes`; `Quejas_Soporte`; `Resenas_Plataforma`; `Equipo_Soporte`; `Sistema/AdminProfile`.
- Data is mostly fetched by loading whole collections and filtering client-side; after each mutation, screens re-run their full `cargarPerfil`/`cargarDatos` loader.

**Media:** every image/file goes to Cloudinary through an unsigned upload preset (cloud name and preset hardcoded in each screen) as base64 data URIs, not Firebase Storage.

**Registration / KYC** (`registro.tsx`): captures INE front/back + selfie with `expo-camera` (the "face detected" state is a timer, not real detection), gets GPS, creates the Auth user, uploads the photos to Cloudinary, then POSTs the Cloudinary URLs plus the Firebase ID token to the worker's `/verificar-identidad`. The worker verifies the token against Google's JWKS, accepts only URLs from its own Cloudinary account, runs OCR.space (name must match the INE) and Face++ compare, and returns `{aprobado, motivo}`. On rejection or error the app deletes the Auth user; on success the **client** writes the profile doc with `kyc_aprobado: true`.
