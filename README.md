# FinVolt

FinVolt es una aplicación personal de gestión financiera, diseñada con React Native y Expo.

## Requisitos

- Node.js (v18+)
- npm o yarn
- Expo CLI

## Instalación

1. Clona el repositorio e instala las dependencias:

   ```bash
   npm install
   ```

2. Ejecuta la aplicación:
   ```bash
   npm run start    # Inicia Expo
   npm run android  # Inicia Expo y abre la app en Android
   npm run ios      # Inicia Expo y abre la app en iOS
   ```

## Scripts Disponibles

- `npm run start` - Inicia el servidor de Expo
- `npm run android` - Ejecuta la app en un emulador o dispositivo Android
- `npm run lint` - Ejecuta ESLint
- `npm run format` - Ejecuta Prettier y formatea el código
- `npm run format:check` - Comprueba si el código está formateado correctamente

## Estructura del Proyecto

- `src/screens/` - Pantallas principales de la aplicación
- `src/components/` - Componentes UI reutilizables
- `src/navigation/` - Configuración de rutas y navegación
- `src/services/` - Servicios externos, APIs y adapters
- `src/hooks/` - Custom hooks de React
- `src/types/` - Definiciones de TypeScript
- `src/utils/` - Funciones de utilidad y helpers
- `src/constants/` - Constantes, temas y configuraciones
- `src/assets/` - Imágenes, fuentes y recursos estáticos
