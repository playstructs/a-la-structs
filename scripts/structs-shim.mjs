/**
 * The structs-webapp core is used verbatim, but a handful of its modules are
 * the webapp's own screens (MenuPage, the map components, banners…). À la
 * Structs has its own screens, so at build time those modules are swapped for
 * inert stand-ins that export the same names. Works as a Vite plugin and as an
 * esbuild plugin.
 */
import fs from 'node:fs';
import path from 'node:path';

export const SHIM_RE = /[\\/]vendor[\\/]structs-webapp[\\/]js[\\/](view_models[\\/]|builders[\\/]|framework[\\/](MenuPage|MenuPageRouter|NotificationDialogue|NotificationDialogueSequence|NotificationDialogueSequenceStep|BannerLayer|DialogueKeyboardControls|MapPanController)\.js$|factories[\\/](NotificationDialogueSequenceFactory|MapTransitionLayerComponentFactory)\.js$|managers[\\/]MapMananger\.js$)/;

export function exportNames(source) {
  const names = new Set();
  for (const m of source.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:class|function\*?|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    m[1].split(',').forEach((part) => { const n = part.trim().split(/\s+as\s+/).pop(); if (n) names.add(n); });
  }
  // `export const A = …, B = …` (the constants style used across the webapp)
  for (const m of source.matchAll(/export\s+const\s*\n?\s*([\s\S]*?);/g)) {
    for (const n of m[1].matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*=/g)) names.add(n[1]);
  }
  names.delete('default');
  return [...names];
}

export function shimSource(file, noopImport) {
  const src = fs.readFileSync(file, 'utf8');
  const names = exportNames(src);
  const hasDefault = /export\s+default/.test(src);
  return `import { makeNoop } from ${JSON.stringify(noopImport)};\n`
    + names.map((n) => `export const ${n} = makeNoop(${JSON.stringify(n)});`).join('\n')
    + (hasDefault ? `\nexport default makeNoop('default');` : '') + '\n';
}

/**
 * The generated protobuf registry imports a couple of message types that the
 * generated query.ts no longer exports. webpack quietly made those undefined;
 * native ES modules refuse to load the file at all. Do what webpack did.
 */
export const REGISTRY_RE = /[\\/]vendor[\\/]structs-webapp[\\/]js[\\/]ts[\\/]structs\.structs[\\/]registry\.ts$/;
const exportCache = new Map();
function exportsOf(file) {
  if (!exportCache.has(file)) {
    let src = '';
    for (const c of [file, file + '.ts', file + '.js']) { if (fs.existsSync(c) && fs.statSync(c).isFile()) { src = fs.readFileSync(c, 'utf8'); break; } }
    const names = new Set();
    for (const m of src.matchAll(/export\s+(?:declare\s+)?(?:const|let|var|class|function|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) m[1].split(',').forEach((x) => { const n = x.trim().split(/\s+as\s+/).pop(); if (n) names.add(n); });
    exportCache.set(file, names);
  }
  return exportCache.get(file);
}
export function fixMissingImports(code, file) {
  return code.replace(/import\s*\{\s*([A-Za-z_$][\w$]*)\s*\}\s*from\s*["'](\.[^"']+)["'];?/g, (line, name, spec) => {
    const target = path.resolve(path.dirname(file), spec);
    return exportsOf(target).has(name) ? line : `const ${name} = undefined; /* not exported by ${spec} */`;
  });
}

/** Vite plugin */
export function structsUiShimVite(noopAbs) {
  return {
    name: 'structs-ui-shim',
    enforce: 'pre',
    load(id) {
      const file = id.split('?')[0];
      if (SHIM_RE.test(file)) return shimSource(file, noopAbs);
      return null;
    },
    transform(code, id) {
      const file = id.split('?')[0];
      if (REGISTRY_RE.test(file)) return { code: fixMissingImports(code, file), map: null };
      return null;
    },
  };
}

/** esbuild plugin */
export function structsUiShimEsbuild(noopAbs) {
  return {
    name: 'structs-ui-shim',
    setup(build) {
      build.onLoad({ filter: /vendor[\\/]structs-webapp[\\/]js[\\/].*\.js$/ }, (args) => {
        if (!SHIM_RE.test(args.path)) return null;
        return { contents: shimSource(args.path, noopAbs), loader: 'js', resolveDir: path.dirname(args.path) };
      });
      build.onLoad({ filter: /registry\.ts$/ }, (args) => {
        if (!REGISTRY_RE.test(args.path)) return null;
        return { contents: fixMissingImports(fs.readFileSync(args.path, 'utf8'), args.path), loader: 'ts', resolveDir: path.dirname(args.path) };
      });
    },
  };
}
