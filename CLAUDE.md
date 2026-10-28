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

The app reaches the worker through `EXPO_PUBLIC_KYC_API_URL` in `.env`. Worker secrets: `OCR_KEY`, `FACE_KEY`, `FACE_SECRET`, `FIREBASE_SERVICE_ACCOUNT` (full service-account JSON, piped in: `Get-Content cuenta.json -Raw | npx wrangler secret put FIREBASE_SERVICE_ACCOUNT`).

Firestore security rules live in `firestore.rules` (repo root) and are published by pasting them into Firebase console → Firestore → Reglas. Any client write you add must be allowed there.

Git: `git` is not on PATH in this machine's shell; use `& "C:\Program Files\Git\cmd\git.exe"`. Everything must stay on free tiers (Firebase Spark — no Cloud Functions — and Cloudflare Workers free), which is why server-side logic lives in the Worker.

## Architecture

**Product:** job marketplace for trades in Mexico. Two user roles — *Trabajador* (worker) and *Contratista* (employer) — plus a hidden admin panel.

**Routing:** `src/app/_layout.tsx` is a header-less `Stack`. There is no tab navigator: each screen draws its own fake bottom bar and jumps between screens with `router.push(... as any)`. Screens switch internal "tabs" with a `pestañaActiva` state string; `mensajes.tsx` passes `params.tab` to the dashboards (only `dashboard-trabajador` reads it).

- `index.tsx` login → after `signInWithEmailAndPassword`, `redirigirSegunRol` sends `Administradores/{uid}` → `/admin`, `Contratistas/{uid}` → `/dashboard-contratista`, `Usuarios/{uid}` → `/dashboard-trabajador`; no profile or `estado_cuenta === 'Bloqueada'` → sign out. Login by username/phone goes through the worker's `/iniciar-sesion`: it resolves the email server-side, checks the password with the Identity Toolkit REST API (`FIREBASE_WEB_API_KEY` in `wrangler.toml`), and returns a Firebase custom token for `signInWithCustomToken` — it never returns the email, and answers identically for unknown user and wrong password.
- Worker flow: `dashboard-trabajador` ⇄ `feed` (job board + my applications) ⇄ `mensajes`.
- Contratista flow: `dashboard-contratista` ⇄ `mensajes`.
- `admin.tsx`: admins are normal Firebase Auth users with a doc in `Administradores/{uid}`, created by hand in the console (no client can write it). The screen re-checks this on mount; the rules enforce it server-side.
- `src/app/explore.tsx`, everything in `src/components/`, `src/hooks/`, `src/constants/theme.ts`, `src/global.css` and `scripts/reset-project.js` are leftover create-expo-app template code that no real screen uses.

**Shared code** lives in `src/lib/` (`cloudinary.ts` uploads, `cuenta.ts` account deletion via the worker's `/eliminar-cuenta` — own account, or any account if the caller is admin; `contratos.ts` contract states/actions; `teclado.ts`) and in `src/components/` (`tarjeta-contrato`, `modal-bitacora`, `modal-cancelar-contrato`, shared by both dashboards).

**Contracts** (teacher requirement; collection still named `Postulaciones` to keep old data): `Pendiente` (worker applied) / `Propuesta` (contratista invited) → `Aceptada (En Proceso)` only when the waiting side accepts (cupo is taken then) → `Por confirmar fin` (contratista marks done) → `Finalizada` (worker confirms). Either side can cancel an active obra with a reason → `Suspendida` + automatic `Quejas_Soporte` report with `id_contrato` → admin chooses `admin_reactivar` or `admin_cancelar` (frees the cupo). Every transition goes through the worker's `/contratos` (clients can't write `Postulaciones`; only the two parties and admins can read one). The daily bitácora lives in `Postulaciones/{id}/Bitacora`, written by the worker-side party only while active. Reviews (`/resenas`) require a finalized, suspended or cancelled contract between the two people. Bitácora days have id `AAAA-MM-DD` (one per day, no update rule); the contratista reviews each day via `revisar_bitacora` (`revision`: Pendiente → Confirmada, or En disputa + automatic `Quejas_Soporte` `tipo:'bitacora'` → admin decides Confirmada/Descontada). Either party can `reportar_problema` (`tipo:'incumplimiento'`) without suspending. The admin resolves non-cancellation reports through the worker's `/reportes` (decision + required note); every admin decision writes `Notificaciones` for both parties (worker-only create; owner can only set `leida`), shown by `components/avisos-notificaciones`. On `confirmar_fin` the worker appends a summary to the worker profile's protected `obras_realizadas` (public, since contracts are private). Search filters (`components/filtros-busqueda`, `lib/ubicacion.ts`) use profile `ubicacion_estado` (auto-filled from GPS), worker `tarifa_monto`/`tarifa_periodo`, and vacancy `estado_republica`/`pago_monto`/`pago_periodo`/`coordenadas`. Chats store a copy of names/photos (`datos_usuarios`); `mensajes.tsx` overrides it with each person's current profile. The old `portafolio[].bitacora` arrays are legacy data. Bottom-nav jumps between screens use `router.replace` (not `push`) so the stack doesn't grow; dashboards read `params.tab`. Real-time `onSnapshot` listeners must be unsubscribed (see `mensajes.tsx` refs). The login screen restores Firebase's persisted session on open and gates it with `expo-local-authentication` — no passwords are stored.

**Screens are monoliths:** each file in `src/app/` contains all its state, Firebase calls, modals and `StyleSheet` inline (the dashboards are 1000+ lines). Much logic is copy-pasted across screens: `subirFotoACloudinary`, the report (`Quejas_Soporte`) and review modals/handlers, `eliminarCuenta`/`cerrarSesion`, reverse geocoding, the bottom nav. When fixing one copy, check the others.

**Firebase** (`firebaseConfig.js` at repo root, imported as `'../../firebaseConfig'`): exports `auth` (AsyncStorage persistence), `db` and `storage` (`storage` is unused). No `onAuthStateChanged` anywhere; screens read `auth.currentUser` on mount. Firestore collections:

- `Usuarios` = workers, `Contratistas` = employers. The role is implied by which collection holds `{uid}`, and is duplicated in `rol_usuario`. Screens fall back to the other collection if the doc is missing. Only the worker creates these docs; owners can't change `camposProtegidos()` in the rules (name, KYC flag, account state, ratings…), and nobody else can update them.
- Reviews go through the worker's `/resenas`: it requires an accepted `Postulacion` between the two people (direct-hire postulaciones carry `id_contratista`; job-board ones only `id_vacante`, so it looks up the vacancy's owner), allows one review per pair (`Resenas_Plataforma/{evaluador}_{evaluado}`, create-only), and recomputes `calificacion`/`numero_resenas` with an `updateTime` precondition.
- `Verificaciones/{uid}` (private INE photo URLs, worker-written, readable by owner/admin) and `Administradores/{uid}`.
- A worker's portfolio (`portafolio[]`) and each work's daily log (`bitacora[]`) are arrays inside the worker's user doc, keyed by `id_obra` but matched to vacancies by **title** (`titulo === titulo_vacante`).
- `Vacantes` (`id_contratista`, `cupo_total`/`cupo_actual`, `estado` 'Activa'|'Cerrada'), `Postulaciones` (`id_trabajador`, `id_vacante`, `estado` 'Pendiente'|'Aceptada (En Proceso)'|'Rechazada'; contratista "direct hire" creates these with a different shape).
- `Chats` (`usuarios_ids[]`, denormalized `datos_usuarios`, `leido`, `bloqueado`) with subcollection `Mensajes`; `Quejas_Soporte`; `Resenas_Plataforma`; `Equipo_Soporte`; `Sistema/AdminProfile`.
- Data is mostly fetched by loading whole collections and filtering client-side; after each mutation, screens re-run their full `cargarPerfil`/`cargarDatos` loader.

**Media:** every image/file goes to Cloudinary (not Firebase Storage) through `src/lib/cloudinary.ts` (`subirACloudinary` / `subirFotoACloudinary`). Uploads are **signed**: the app asks the worker's `/firma-subida` for a signature (requires a Firebase session), which pins the folder to `palantemx/publico/{uid}` or, for INE photos, `palantemx/ine/{uid}` with `type: authenticated` (private). Private INE images are stored in `Verificaciones` by `public_id` + format, and only the worker can build their signed delivery URL (`urlPrivadaCloudinary`). Worker secrets for this: `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

**Registration / KYC** (`registro.tsx`): captures INE front/back + selfie with `expo-camera` (the "face detected" state is a timer, not real detection), gets GPS, creates the Auth user, uploads the photos to Cloudinary, then POSTs the profile data (INE `public_id`s + selfie URL) with the Firebase ID token to the worker's `/verificar-identidad`. The worker verifies the token against Google's JWKS (uid and email come from the token, not the body), validates the fields, accepts only URLs from its own Cloudinary account, runs OCR.space (name must match the INE) and Face++ compare, and on approval **the worker** writes `Verificaciones/{uid}` and creates the profile doc (`kyc_aprobado: true`, `estado_cuenta: 'Activa'`) via the Firestore REST API with a service account (create-only, so it can't be overwritten). It returns `{aprobado, motivo}`; on rejection or error the app deletes the Auth user, on success it signs out and sends the user to the login.
