# Next.js template

This is a Next.js template with shadcn/ui.

## Despliegue en Vercel

1. [Importa el repositorio de GitHub](https://vercel.com/docs/git/vercel-for-github) como proyecto Next.js. La raíz del repositorio contiene `package.json`.
2. Crea un [almacén privado de Vercel Blob](https://vercel.com/docs/vercel-blob/private-storage) y conéctalo al proyecto en el entorno **Production**. La conexión por OIDC configura `BLOB_STORE_ID` y la autenticación para las funciones. Una conexión con `BLOB_READ_WRITE_TOKEN` también es compatible.
3. Despliega de nuevo después de conectar el almacén. El primer voto crea `itaca/votes.json` en Blob. Los totales se consultan cada cinco segundos mientras la pestaña está visible.

En local, `npm run dev` guarda los votos en `.data/votes.json` cuando Blob no está configurado. Este archivo es independiente del de producción. Si habilitas Blob en **Preview**, los votos de ese entorno se guardan en `itaca/preview-votes.json`.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button";
```
