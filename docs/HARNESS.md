# FinVolt — Development Harness

> **Propósito:** Definir el flujo de trabajo completo entre el agente de IA, el desarrollador y GitHub para garantizar que cada historia de usuario se implementa, se prueba y se cierra trazablemente.  
> Este documento es la fuente de verdad del proceso. Actualízalo si el flujo cambia.

---

## Índice

1. [Filosofía](#1-filosofía)
2. [Herramientas requeridas](#2-herramientas-requeridas)
3. [Estructura de ramas](#3-estructura-de-ramas)
4. [GitHub Project](#4-github-project)
5. [Ciclo de vida de una historia](#5-ciclo-de-vida-de-una-historia)
6. [Scripts de automatización](#6-scripts-de-automatización)
7. [Flujo con el agente de IA](#7-flujo-con-el-agente-de-ia)
8. [Checklist de aceptación por historia](#8-checklist-de-aceptación-por-historia)
9. [Convenciones de commits](#9-convenciones-de-commits)
10. [Convenciones de nombres](#10-convenciones-de-nombres)
11. [Referencias del proyecto](#11-referencias-del-proyecto)

---

## 1. Filosofía

- **Una rama por historia.** Nunca se trabaja directamente en `main`.
- **Merge solo cuando funciona.** El merge a `main` ocurre cuando el desarrollador confirma que los criterios de aceptación se cumplen en un dispositivo/emulador real.
- **El backlog en GitHub Project es la única fuente de verdad del estado.** El agente lo actualiza automáticamente; el desarrollador lo revisa.
- **El agente propone, el desarrollador decide.** El agente escribe código y mueve estados; el merge final siempre requiere la aprobación humana.
- **Trazabilidad total.** Cada commit, rama y PR está vinculado a un issue y a un item del Project.

---

## 2. Herramientas requeridas

| Herramienta | Versión mínima | Uso |
|---|---|---|
| `gh` CLI | 2.x | Gestión de issues, PRs y Project |
| `git` | 2.x | Control de versiones |
| `bun` | 1.x | Runtime y gestor de paquetes |
| `npx expo` | SDK 53 | Dev server y builds |
| PowerShell | 7+ | Ejecución de scripts de harness |

Verificar instalación:
```powershell
gh --version; git --version; bun --version; npx expo --version
```

---

## 3. Estructura de ramas

```
main                         ← siempre estable, solo recibe merges aprobados
│
├── feature/US-009-registrar-gasto-manual
├── feature/US-010-registrar-ingreso-manual
└── feature/US-014-quick-entry
```

### Naming de ramas

```
feature/<ID>-<slug-del-titulo>
```

Ejemplos:
- `feature/US-009-registrar-gasto-manual`
- `feature/US-018-modelo-raw-event`

> Los scripts crean la rama automáticamente con el slug correcto a partir del título del issue.

---

## 4. GitHub Project

**Proyecto:** `@Diego-CGTZ's untitled project`  
**Project ID:** `PVT_kwHOB42opc4BhtJ7`  
**URL:** https://github.com/users/Diego-CGTZ/projects/1

### Estados del tablero (Status)

| Estado | Significado |
|---|---|
| `Todo` | Historia en el backlog, sin iniciar |
| `In Progress` | El agente o el desarrollador están trabajando en ella |
| `In Review` | PR creado, en espera de pruebas en dispositivo |
| `Done` | PR mergeado, issue cerrado |

> Los scripts `start-story`, `finish-story` y `merge-story` mueven el estado automáticamente.

### Campos del Project

| Campo | ID | Uso |
|---|---|---|
| Status | `PVTSSF_lAHOB42opc4BhtJ7zhgn6_o` | Estado del workflow |
| Epic | `PVTSSF_lAHOB42opc4BhtJ7zhgn8Uc` | Agrupación por épica |

---

## 5. Ciclo de vida de una historia

```
Backlog (Todo)
    │
    ▼  .\scripts\start-story.ps1 -StoryId US-XXX
In Progress
    │
    │  [El agente implementa el código]
    │  [El desarrollador revisa y prueba en emulador/dispositivo]
    │
    ▼  .\scripts\finish-story.ps1 -StoryId US-XXX
In Review (PR abierto)
    │
    │  [Prueba definitiva en dispositivo real]
    │  [Criterios de aceptación verificados]
    │
    ▼  .\scripts\merge-story.ps1 -StoryId US-XXX
Done (PR mergeado, issue cerrado, rama eliminada)
```

---

## 6. Scripts de automatización

Todos los scripts viven en `./scripts/` y requieren `gh` autenticado.

### `start-story.ps1`

**Cuándo usarlo:** Al inicio de cada historia, antes de que el agente empiece a codear.

```powershell
.\scripts\start-story.ps1 -StoryId US-009
```

**Qué hace:**
1. Busca el issue `[US-009]` en GitHub
2. Crea la rama `feature/US-009-<slug>` desde `main` actualizado
3. Activa la rama localmente
4. Mueve el item en el Project a **In Progress**
5. Asigna el issue al usuario actual

---

### `finish-story.ps1`

**Cuándo usarlo:** Cuando el agente termina la implementación y el código está listo para revisión.

```powershell
.\scripts\finish-story.ps1 -StoryId US-009
```

**Qué hace:**
1. Verifica que la rama activa corresponde a la historia
2. Hace `git push` de la rama al remoto
3. Crea un Pull Request con checklist y vinculación al issue (`Closes #N`)
4. Mueve el item en el Project a **In Review**

---

### `merge-story.ps1`

**Cuándo usarlo:** Solo cuando el desarrollador ha probado en dispositivo y aprueba el PR.

```powershell
.\scripts\merge-story.ps1 -StoryId US-009
```

**Qué hace:**
1. Hace squash-merge del PR en `main`
2. Elimina la rama remota y local
3. Mueve el item en el Project a **Done**
4. Hace `git pull origin main` para quedar sincronizado

> ⚠️ **Este script es el único punto de no retorno.** No ejecutarlo hasta que las pruebas sean satisfactorias.

---

## 7. Flujo con el agente de IA

### Inicio de sesión de trabajo

1. Ejecutar `start-story.ps1` para activar la historia
2. Decirle al agente: *"Vamos a implementar US-XXX. La rama ya está activa."*
3. El agente lee los criterios de aceptación del issue y la arquitectura en `docs/ARCHITECTURE.md`
4. El agente implementa el código en commits atómicos

### Durante la implementación

- El agente hace commits descriptivos siguiendo las convenciones (ver §9)
- El agente no hace push ni mueve el Project sin indicación explícita
- Si el agente necesita aclarar algo, pregunta antes de continuar

### Al terminar la implementación

1. El agente avisa que terminó y describe qué cambió
2. El desarrollador prueba en emulador o dispositivo físico
3. Si hay ajustes, el agente los hace en la misma rama
4. Cuando todo funciona: ejecutar `finish-story.ps1`
5. Revisión final del PR → ejecutar `merge-story.ps1`

### Comportamiento del agente con el backlog

- El agente **no** cierra issues manualmente; los scripts lo hacen al mergear
- El agente **puede** leer el backlog del CSV o de los issues de GitHub para entender contexto
- El agente **no** modifica el CSV del backlog; este es solo una fuente inicial de importación

---

## 8. Checklist de aceptación por historia

Antes de ejecutar `merge-story.ps1`, verificar:

```
□ La funcionalidad se puede usar en Android (emulador o dispositivo)
□ No hay errores en consola de Metro ni en la app
□ npx tsc --noEmit → sin errores
□ npx expo lint → sin errores
□ Todos los criterios de aceptación del issue están cumplidos
□ No se rompió ninguna funcionalidad previa (smoke test)
□ Si hay cambios de base de datos: migraciones aplicadas en Supabase
```

---

## 9. Convenciones de commits

Usar [Conventional Commits](https://www.conventionalcommits.org/):

```
<tipo>(<scope>): <descripción corta>

[cuerpo opcional]

[referencias: Closes #N, Refs US-XXX]
```

### Tipos

| Tipo | Cuándo usarlo |
|---|---|
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de bug |
| `refactor` | Cambio interno sin cambiar comportamiento |
| `chore` | Configuración, dependencias, scripts |
| `docs` | Solo documentación |
| `test` | Tests (cuando se agreguen) |
| `db` | Migraciones o cambios de esquema |

### Ejemplos

```
feat(transactions): add expense registration form (US-009)
fix(auth): handle expired session on startup
db(accounts): add currency column to accounts table
chore(scripts): add start-story automation script
```

---

## 10. Convenciones de nombres

### Ramas
```
feature/<US-ID>-<slug-en-minusculas-con-guiones>
```

### Issues (en GitHub)
```
[US-XXX] Título de la historia
```

### Archivos (dentro de `src/`)
```
PascalCase      → Componentes React Native (.tsx)
camelCase       → Hooks, utils, servicios (.ts)
kebab-case      → Archivos de configuración, scripts
```

### Funciones y variables
- `camelCase` para funciones y variables
- `UPPER_SNAKE_CASE` para constantes de entorno y configuración
- `PascalCase` para tipos, interfaces y componentes

---

## 11. Referencias del proyecto

| Recurso | Ruta / URL |
|---|---|
| Repositorio | https://github.com/Diego-CGTZ/FinVolt |
| GitHub Project | https://github.com/users/Diego-CGTZ/projects/1 |
| Backlog (CSV) | `./app_finanzas_github_backlog.csv` |
| Arquitectura | `./docs/ARCHITECTURE.md` |
| Script inicio | `./scripts/start-story.ps1` |
| Script PR | `./scripts/finish-story.ps1` |
| Script merge | `./scripts/merge-story.ps1` |
| Import backlog | `./import-backlog.ps1` |
| Reglas del agente | `./AGENTS.md` |
| Expo docs | https://docs.expo.dev/versions/v53.0.0/ |
| Supabase docs | https://supabase.com/docs |

---

*Última actualización: 2026-09-24 — Workflow establecido junto con el agente Antigravity.*
