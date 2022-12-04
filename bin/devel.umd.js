/*
 *    Browser file loader for development mode - Load all files, including transpilation.
 *    Copyright (C) 2014-2021  Richard Huang <rickypc@users.noreply.github.com>
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

// yarn add @babel/standalone --optional

/* global Babel */

const attachScript = ({ text, transformed = false }) => {
  const script = document.createElement('script');
  script.text = text;
  if (transformed) {
    script.type = 'module';
  }
  (document.head || document.querySelector('head')).appendChild(script);
};

const getBasePath = (path) => path.substring(0, path.lastIndexOf('/'));

const getBaseUrl = (path) => {
  const { origin, pathname, protocol } = window.location;

  if (path.charAt(0) === '/') {
    return origin;
  }

  const href = `${origin}${pathname}`;
  const response = href.substring(0, href.lastIndexOf('/'));

  if (path.startsWith(protocol) && !~path.indexOf(response)) {
    return origin;
  }

  return response;
};

const getDepth = (paths) => paths.reduce((accumulator, current) => {
  // eslint-disable-next-line no-bitwise
  if (!~current.indexOf('node_modules')) {
    const depth = current
      .replace(/\/index|\.js$/g, '')
      .split('/')
      .length - 1;
    return accumulator < depth ? depth : accumulator;
  }
  return accumulator;
}, 0);

const getModuleParts = (path) => {
  // eslint-disable-next-line no-bitwise
  const sanitized = ~path.indexOf('node_modules')
    ? path : path.replace(`${getBaseUrl(path)}/`, '');
  const parts = sanitized.split('/');

  // Any index.*.js.
  if (/index(?:\..+)?\.js/.test(parts[parts.length - 1])) {
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
  return parts[parts.length - 1].replace(/\.json$|\.js$/g, '');
};

const titleCase = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const titleCaseByDelimiter = (value, delimiter = /[-_.]/) => value.split(delimiter)
  .map((chunk) => titleCase(chunk))
  .join('');

// After titleCaseByDelimiter definition.
const getModuleId = (path, globals = {}) => {
  const fileName = getModuleFileName(path);

  // eslint-disable-next-line no-bitwise
  if (~path.indexOf('node_modules')) {
    const matches = Object.keys(globals || {})
      .filter((key) => key.includes(fileName));
    return matches.length ? globals[matches[0]] : fileName;
  }

  // Add support for same name on different namespace.
  const parts = getModuleParts(path);
  // We already have the last element.
  parts.pop()

  return `${parts
    .filter((part) => part !== '..')
    .map((part, index) => index === 0 ? part.toLowerCase() : titleCaseByDelimiter(part))
    .join('')}${titleCaseByDelimiter(fileName)}`;
};

// After getModuleId definition.
const getGlobals = (path, depth = 4) => {
  const globals = {};

  // eslint-disable-next-line no-bitwise
  if (~path.indexOf('node_modules')) {
    return globals;
  }

  const name = getModuleId(path);
  const relative = path.replace(/\/index|\.js$/g, '');
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

const getPlugins = (url, globals) => ([
  Babel.availablePlugins['proposal-class-properties'],
  [
    Babel.availablePlugins['transform-modules-umd'],
    {
      exactGlobals: true,
      getModuleId: () => getModuleId(url, globals),
      globals,
      moduleIds: true,
    },
  ],
]);

const getPresets = () => ([
  [
    Babel.availablePresets.env,
    {
      exclude: [
        'transform-typeof-symbol',
      ],
      targets: {
        browsers: [
          'last 2 versions',
          '> 5%',
        ],
      },
    },
  ],
  Babel.availablePresets.react,
]);

const getSource = async (url) => {
  let response = await fetch(url);
  if (response.status !== 200) {
    response = null;
    return '';
  }
  const source = await response.text();
  response = null;
  return source;
};

let inflight = false;

const loadScript = async ({ globals, path, transformed = false }) => {
  const url = `${getBaseUrl(path)}/${path}`;
  const source = await getSource(url);

  if (!transformed) {
    return attachScript({
      text: source.replace(/# sourceMappingURL=(.*)/g,
        `# source=${path}\n//# sourceMappingUrl=${getBasePath(path)}/$1`),
    });
  }

  const { code } = Babel.transform(source, {
    comments: false,
    compact: false,
    plugins: getPlugins(url, globals),
    presets: getPresets(),
    sourceFileName: path,
    sourceMaps: 'inline',
  });

  return attachScript({
    text: code.replace(/# sourceMappingURL=(.*)/g,
      `# source=${path}\n//# sourceMappingUrl=$1`),
    transformed,
  });
};

// eslint-disable-next-line no-unused-vars
const loadStyles = (styles) => {
  (document.head || document.querySelector('head'))
    .insertAdjacentHTML('beforeend',
      `<style>${styles.map((style) => `@import'${style}'`).join(';')}</style>`);
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
// eslint-disable-next-line no-unused-vars
const loadTransforms = async (paths, globalsOverrides) => {
  let found = false;
  try {
    found = !!Babel;
  } catch {
    // eslint-disable-next-line no-console
    console.error('Did you forget to install @babel/standalone?');
    return found;
  }

  await waitUntil(() => !inflight);
  inflight = true;
  const globals = getAllGlobals(paths, globalsOverrides);

  await paths.reduce(async (accumulator, path) => {
    await accumulator;
    return loadScript({ globals, path, transformed: true });
  }, Promise.resolve());

  inflight = false;
  return found;
};

// eslint-disable-next-line no-unused-vars
const loadUmds = async (paths) => {
  await waitUntil(() => !inflight);
  inflight = true;

  await paths.reduce(async (accumulator, path) => {
    await accumulator;
    return loadScript({ path });
  }, Promise.resolve());

  inflight = false;
};
