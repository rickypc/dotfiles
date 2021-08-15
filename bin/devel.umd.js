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

const attachScript = ({ text, transformed = false }) => {
  const script = document.createElement('script');
  script.text = text;
  if (transformed) {
    script.type = 'module';
  }
  (document.head || document.querySelector('head')).appendChild(script);
};

const getAllGlobals = (paths, overrides) => {
  const depth = getDepth(paths);
  return Object.assign({}, ...(paths.map((path) => getGlobals(path, depth))), overrides);
};

const getBaseUrl = () => {
  const href = window.location.href;
  return href.substring(0, href.lastIndexOf('/'));
};

const getDepth = (paths) => {
  let response = 0;
  for (let path of paths) {
    if (~path.indexOf('node_modules')) {
      continue;
    }
    const depth = path.replace(/\/app|\/index|\.js$/g, '').split('/').length - 2;
    if (response < depth) {
      response = depth;
    }
  }
  return response;
};

const getGlobals = (path, depth = 4) => {
  const globals = {};
  if (~path.indexOf('node_modules')) {
    return globals;
  }
  const file = getModuleFileName(path);
  const name = getModuleId(path);
  const relative = path.replace(/\/app|\/index|\.js$/g, '');
  globals[relative] = name;
  globals[`./${file}`] = name;
  const rels = getModuleParts(relative);
  while (rels.length - 1) {
    Array(depth).fill(0)
      .map((_, i) => globals[`${Array(i + 1).fill('..').join('/')}/${rels.join('/')}`] = name);
    // Remove parent folder.
    rels.shift();
  }
  return globals;
};

const getModuleFileName = (path) => {
  const parts = getModuleParts(path);
  return parts[parts.length - 1].replace(/\.json$|\.js$/g, '');
};

const getModuleId = (path) => {
  let response = getModuleFileName(path);

  switch (response) {
    case 'fontawesome-svg-core':
      response = 'FontAwesomeSvgCore';
      break;
    case 'free-solid-svg-icons':
      response = 'FreeSolidSvgIcons';
      break;
    case 'react-fontawesome':
      response = 'FontAwesome';
      break;
  }

  // Add support for same name on different namespace.
  if (!~path.indexOf('node_modules')) {
    const parts = getModuleParts(path);
    // We already have the last element.
    parts.pop();
    response = response.split('-').map((chunk) => titleCase(chunk)).join('');
    response = `${parts.map((part) => titleCase(part)).join('')}${response}`;
  }

  return response;
};

const getModuleParts = (path) => {
  if (!~path.indexOf('node_modules')) {
    path = path.replace(`${getBaseUrl()}/`, '');
  }

  const parts = path.split('/');

  if (~'|index.es.js|index.js|'.indexOf(`|${parts[parts.length - 1]}|`)) {
    parts.pop();
  }

  if (parts.length && parts[0] === '.') {
    parts.shift();
  }

  return parts;
};

const getPlugins = (url, globals) => {
  return [
    Babel.availablePlugins['proposal-class-properties'],
    [
      Babel.availablePlugins['transform-modules-umd'],
      {
        exactGlobals: true,
        getModuleId: () => getModuleId(url),
        globals,
        moduleIds: true,
      },
    ],
  ];
};

const getPresets = () => {
  return [
    [
      Babel.availablePresets['env'],
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
    Babel.availablePresets['react'],
  ];
};

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

const loadScript = async ({ globals, path, transformed = false }) => {
  const url = `${getBaseUrl()}/${path}`;
  const source = await getSource(url);
  if (!transformed) {
    return attachScript({ text: source });
  }
  const text = Babel.transform(source, {
    compact: false,
    plugins: getPlugins(url, globals),
    presets: getPresets(),
    sourceFileName: path,
    sourceMaps: 'inline',
  }).code;
  attachScript({ text, transformed });
};

const loadStyles = (styles) => {
  (document.head || document.querySelector('head'))
    .insertAdjacentHTML('beforeend',
    `<style>${styles.map((style) => `@import'${style}'`).join(';')}</style>`);
};

const loadTransforms = async (paths, globalsOverrides) => {
  try {
    Babel;
  } catch (_) {
    return console.error('Did your forgot to install @babel/standalone?');
  }
  const globals = getAllGlobals(paths, globalsOverrides);
  for (let path of paths) {
    await loadScript({ globals, path, transformed: true });
  }
};

const loadUmds = async (paths) => {
  paths.unshift(...[
    '../node_modules/@babel/standalone/babel.js',
  ]);
  for (let path of paths) {
    await loadScript({ path });
  }
};

const titleCase = (value) => value.charAt(0).toUpperCase() + value.slice(1);
