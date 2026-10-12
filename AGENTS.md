This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- **MÁXIMA AUTONOMÍA OPERATIVA:**
  - Trabajar con total autonomía durante todo el ciclo de desarrollo (creación de rama, diseño, codificación, refactorización, ejecución de tests, resolución de fallos, typecheck y linter).
  - No solicitar autorización ni confirmaciones intermedias durante el proceso de implementación.
  - **Única solicitud de autorización:** Pedir autorización al usuario ÚNICAMENTE al concluir la implementación completa y el análisis de calidad de la historia, presentando el resumen breve y las instrucciones de prueba antes de fusionar a `main`.
- **PREVENCIÓN DE BUCLES (LÍMITE DE 5 REPETICIONES):**
  - Si una misma petición, acción, error o intento de corrección se repite 5 veces de forma consecutiva sin resolverse o detectas un ciclo sin progreso, detén la ejecución inmediatamente y solicita al usuario revisar lo que está ocurriendo para evitar bucles infinitos.
- **NUNCA USAR EMOJIS EN LA UI:** Queda terminantemente prohibido utilizar emojis (ej. 💳, 🏦, 💵, 🔴, 🟢, ✨, etc.) en cualquier componente visual, texto, botón o pantalla. Utiliza SIEMPRE íconos vectoriales (`@expo/vector-icons`, ej. `Ionicons`) o elementos tipográficos limpios.
- **FLUJO ESTRICTO POR HISTORIA & ANÁLISIS DE CALIDAD:**
  1. Crear rama dedicada (`feature/US-XXX-<slug>`) desde `main` actualizado. Nunca trabajar directo en `main`.
  2. Implementar de forma autónoma y exclusiva los criterios de la historia.
  3. Ejecutar análisis de calidad obligatorio al terminar:
     - Tests específicos de la historia y regresión completa (`npm test`).
     - Verificación exhaustiva de cumplimiento de Acceptance Criteria (AC).
     - Typecheck (`npx tsc --noEmit`) y linter (`npx expo lint`) en 0 errores.
  4. Entregar un resumen muy breve de lo implementado y explicar exactamente cómo probarlo en la app (o indicar explícitamente si no se puede probar aún en la UI).
  5. Solicitar autorización al usuario para el merge a `main`.
  6. Merge a `main` únicamente tras la aprobación de calidad del usuario.
  7. Sincronizar `main` antes de iniciar la siguiente historia.
- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
