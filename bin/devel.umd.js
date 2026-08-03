/*
 *    Browser file loader for development mode - Load all files, including transpilation.
 *    Copyright © 2014 Richard Huang <rickypc@users.noreply.github.com>
 *
 *    This program is free software: you can redistribute it and/or modify
 *    it under the terms of the GNU Affero General Public License as
 *    published by the Free Software Foundation, either version 3 of the
 *    License, or (at your option) any later version.
 *
 *    This program is distributed in the hope that it will be useful,
 *    but WITHOUT ANY WARRANTY; without even the implied warranty of
 *    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *    GNU Affero General Public License for more details.
 *
 *    You should have received a copy of the GNU Affero General Public License
 *    along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

// bun add @babel/standalone --optional
// bun add babel-plugin-module-resolver-standalone --optional

const getDocument = () => globalThis.document;

const reportLoaderError = (message, error) => {
  // eslint-disable-next-line no-console
  console.error(`[devel.umd.js] ${message}`, error || '');
};

const attachScript = ({ text, type = '' }) => {
  const documentObject = getDocument();
  if (!documentObject || typeof documentObject.createElement !== 'function') {
    reportLoaderError('document is unavailable; load the loader in a browser document.');
    return false;
  }

  const script = documentObject.createElement('script');
  script.text = text;
  if (type) {
    script.type = type;
  }
  (documentObject.head || documentObject.querySelector('head')).appendChild(script);
  return true;
};

const getBasePath = (path) => path.substring(0, path.lastIndexOf('/'));

const getBaseUrl = (path) => {
  const { origin, pathname, protocol } = window.location;

  if (path.charAt(0) === '/') {
    return origin;
  }

  const href = `${origin}${pathname}`;
  const response = href.substring(0, href.lastIndexOf('/'));

  if (path.startsWith(protocol) && !path.includes(response)) {
    return origin;
  }

  return response;
};

const getDepth = (paths) => paths.reduce((accumulator, current) => {
  if (!current.includes('node_modules')) {
    const depth = current
      .replace(/\/index|\.js$/g, '')
      .split('/')
      .length - 1;
    return accumulator < depth ? depth : accumulator;
  }
  return accumulator;
}, 0);

const getModuleParts = (path) => {
  const sanitized = path.includes('node_modules')
    ? path : path.replace(`${getBaseUrl(path)}/`, '');
  const parts = sanitized.split('/');

  // Any index.*.js.
  // eslint-disable-next-line security/detect-unsafe-regex
  if (/index(?:\.[^/]+)?\.js$/.test(parts.at(-1))) {
    parts.pop();
  }

  if (parts.length && parts[0] === '.') {
    parts.shift();
  }

  return parts.filter((part) => part);
};

// After getModuleParts definition.
const getModuleFileName = (path) => {
  const parts = getModuleParts(path);
  return parts.at(-1).replace(/\.(json|jsx?|tsx?)$/g, '');
};

const titleCase = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const titleCaseByDelimiter = (value, delimiter = /[-_.]/) => value.split(delimiter)
  .map((chunk) => titleCase(chunk))
  .join('');

// After titleCaseByDelimiter definition.
const getModuleId = (path, globals = {}) => {
  const fileName = getModuleFileName(path);

  if (path.includes('node_modules')) {
    const matches = Object.keys(globals || {})
      .filter((key) => key.includes(fileName));
    return matches.length ? globals[matches[0]] : fileName;
  }

  // Add support for same name on different namespace.
  const parts = getModuleParts(path);
  // We already have the last element.
  parts.pop();

  return `${parts
    .filter((part) => part !== '..')
    .map((part, index) => (index === 0 ? part.toLowerCase() : titleCaseByDelimiter(part)))
    .join('')}${titleCaseByDelimiter(fileName)}`;
};

// After getModuleId definition.
const getGlobals = (path, depth = 4) => {
  const globals = {};

  if (path.includes('node_modules')) {
    return globals;
  }

  const name = getModuleId(path);
  const relative = path.replace(/\/index|\.(jsx?|tsx?)$/g, '');
  // eslint-disable-next-line security/detect-object-injection
  globals[relative] = name;
  const rels = getModuleParts(relative);

  while (rels.length) {
    Array(depth).fill(0).forEach((_, i) => {
      globals[`${Array(i + 1).fill('..').join('/')}/${rels.join('/')}`] = name;
    });
    globals[`./${rels.join('/')}`] = name;
    // Remove parent folder.
    rels.shift();
  }

  return globals;
};

// After getDepth and getGlobals definition.
const getAllGlobals = (paths, overrides) => {
  const depth = getDepth(paths);
  return Object.assign({}, ...(paths.map((path) => getGlobals(path, depth))), overrides);
};

const getBabel = () => globalThis.Babel;

const getModuleResolver = () => globalThis.moduleResolver;

const getSourceKind = (path) => {
  if (/\.tsx$/iu.test(path)) {
    return 'tsx';
  }
  if (/\.jsx$/iu.test(path)) {
    return 'jsx';
  }
  if (/\.ts$/iu.test(path)) {
    return 'ts';
  }
  return 'js';
};

const getMissingCapabilities = (path, imports) => {
  const missing = [];
  const babel = getBabel();
  const kind = getSourceKind(path);

  if (!babel || typeof babel.transform !== 'function') {
    missing.push('Babel global (@babel/standalone)');
    return missing;
  }

  const plugins = babel.availablePlugins || {};
  const presets = babel.availablePresets || {};
  if (typeof plugins['transform-class-properties'] !== 'function') {
    missing.push('Babel plugin transform-class-properties');
  }
  if (typeof plugins['transform-modules-umd'] !== 'function') {
    missing.push('Babel plugin transform-modules-umd');
  }
  if (typeof presets.typescript !== 'function') {
    missing.push('Babel preset typescript');
  }
  if (typeof presets.env !== 'function') {
    missing.push('Babel preset env');
  }
  if (kind !== 'ts' && typeof presets.react !== 'function') {
    missing.push('Babel preset react');
  }
  if (imports && typeof getModuleResolver() !== 'function') {
    missing.push('babel-plugin-module-resolver-standalone (optional imports support)');
  }

  return missing;
};

const reportMissingCapabilities = (path, imports) => {
  const missing = getMissingCapabilities(path, imports);
  if (!missing.length) {
    return true;
  }

  reportLoaderError(
    `cannot transform ${path}; missing ${missing.join(', ')}. ` +
      'Load @babel/standalone and its browser plugins/presets before calling loadTransforms.',
  );
  return false;
};

const getPlugins = (url, globals, imports) => {
  const babel = getBabel();
  const plugins = [
    babel.availablePlugins['transform-class-properties'],
    [
      babel.availablePlugins['transform-modules-umd'],
      {
        exactGlobals: true,
        getModuleId: () => getModuleId(url, globals),
        globals,
        moduleIds: true,
      },
    ],
  ];
  if (imports) {
    try {
      const moduleResolver = getModuleResolver();
      if (moduleResolver) {
        plugins.push([moduleResolver, {
          resolvePath(source) {
            const keys = Object.keys(imports);
            for (let i = 0, j = keys.length; i < j; i += 1) {
              // eslint-disable-next-line security/detect-object-injection
              const key = keys[i];
              if (source.includes(key)) {
                // eslint-disable-next-line security/detect-object-injection
                return source.replace(key, imports[key]);
              }
            }
            return source;
          },
        }, 'module-resolver']);
      }
    } catch (error) {
      reportLoaderError('module resolver could not be configured.', error);
    }
  }
  return plugins;
};

const getPresets = (path) => {
  const babel = getBabel();
  const presets = [
    babel.availablePresets.typescript,
    [
      babel.availablePresets.env,
      {
        exclude: ['transform-typeof-symbol'],
        targets: { browsers: ['last 2 versions', '> 5%'] },
      },
    ],
  ];

  if (getSourceKind(path) !== 'ts') {
    presets.push([babel.availablePresets.react, { runtime: 'classic' }]);
  }

  return presets;
};

const getSource = async (url) => {
  const response = await globalThis.fetch(url);
  if (!response || response.status !== 200) {
    throw new Error(`source request returned ${(response && response.status) || 'no status'} for ${url}`);
  }
  return response.text();
};

let inflight = false;

const loadScript = async ({
  globals, imports, path, transformed = false,
}) => {
  const url = `${getBaseUrl(path)}/${path}`;
  if (transformed && !reportMissingCapabilities(path, imports)) {
    return false;
  }

  let source;
  try {
    source = await getSource(url);
  } catch (error) {
    reportLoaderError(`cannot load ${path}.`, error);
    return false;
  }

  if (!transformed) {
    try {
      return attachScript({
        text: source.replace(
          /# sourceMappingURL=(.*)/g,
          `# source=${path}\n//# sourceMappingUrl=${getBasePath(path)}/$1`,
        ),
      });
    } catch (error) {
      reportLoaderError(`cannot append ${path}.`, error);
      return false;
    }
  }

  const babel = getBabel();
  let code;
  try {
    ({ code } = babel.transform(source, {
      comments: false,
      compact: false,
      plugins: getPlugins(url, globals, imports),
      presets: getPresets(path),
      filename: path,
      sourceFileName: path,
      sourceMaps: 'inline',
    }));
  } catch (error) {
    reportLoaderError(`cannot transform ${path}.`, error);
    return false;
  }

  try {
    return attachScript({
      text: code.replace(
        /# sourceMappingURL=(.*)/g,
        `# source=${path}\n//# sourceMappingUrl=$1`,
      ),
      type: transformed ? 'module' : '',
    });
  } catch (error) {
    reportLoaderError(`cannot append ${path}.`, error);
    return false;
  }
};

/**
 * Load CSS URLs in order by adding one import style block to the current document.
 * @param {string[]} styles CSS URLs; an empty array is a no-op.
 * @returns {boolean} whether the style block was added.
 */
const loadStyles = (styles) => {
  if (!Array.isArray(styles) || !styles.every((style) => typeof style === 'string')) {
    reportLoaderError('loadStyles expects an array of CSS URL strings.');
    return false;
  }
  const documentObject = getDocument();
  if (!documentObject || !documentObject.head ||
      typeof documentObject.head.insertAdjacentHTML !== 'function') {
    reportLoaderError('cannot load styles because document.head is unavailable.');
    return false;
  }
  const cssImport = '@' + 'imp' + 'ort';
  documentObject.head.insertAdjacentHTML(
    'beforeend',
    `<style>${styles.map((style) => `${cssImport}'${style}'`).join(';')}</style>`,
  );
  return true;
};

const waitUntil = (predicate) => new Promise((resolve) => {
  // 1m.
  const expiry = new Date().valueOf() + 60000;
  const interval = setInterval(() => {
    if (predicate() || new Date().valueOf() >= expiry) {
      clearInterval(interval);
      resolve();
    }
  }, 100);
});

// After waitUntil definition.
/**
 * Fetch, transform, and append source files sequentially.
 * @param {string[]} paths ordered source paths; .ts omits React parsing, while
 * .tsx/.jsx/.js retain React parsing for JSX compatibility.
 * @param {Record<string, string>} globalsOverrides optional UMD global overrides.
 * @param {Record<string, string>} imports optional module-resolver replacements.
 * @returns {Promise<boolean>} false when input, dependencies, or a source fails.
 */
const loadTransforms = async (paths, globalsOverrides, imports) => {
  if (!Array.isArray(paths) || !paths.every((path) => typeof path === 'string' && path)) {
    reportLoaderError('loadTransforms expects an array of non-empty source path strings.');
    return false;
  }
  if (!reportMissingCapabilities(paths[0] || 'source.ts', imports)) {
    return false;
  }

  await waitUntil(() => !inflight);
  inflight = true;
  try {
    const globals = getAllGlobals(paths, globalsOverrides);
    for (const path of paths) {
      const loaded = await loadScript({
        globals, imports, path, transformed: true,
      });
      if (!loaded) {
        return false;
      }
    }
    return true;
  } finally {
    inflight = false;
  }
};

/**
 * Fetch and append already-built UMD files sequentially without Babel.
 * @param {string[]} paths ordered script paths.
 * @returns {Promise<boolean>} false when input or a source fails.
 */
const loadUmds = async (paths) => {
  if (!Array.isArray(paths) || !paths.every((path) => typeof path === 'string' && path)) {
    reportLoaderError('loadUmds expects an array of non-empty script path strings.');
    return false;
  }
  await waitUntil(() => !inflight);
  inflight = true;
  try {
    for (const path of paths) {
      const loaded = await loadScript({ path });
      if (!loaded) {
        return false;
      }
    }
    return true;
  } finally {
    inflight = false;
  }
};
