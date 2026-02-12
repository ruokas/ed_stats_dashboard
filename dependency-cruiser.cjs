/** @type {import('dependency-cruiser').CruiseOptions} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: 'no-runtime-to-data-reverse-import',
      severity: 'error',
      from: {
        path: '^src/data',
      },
      to: {
        path: '^src/app/runtime',
      },
    },
    {
      name: 'no-runtime-to-legacy-full-page-app',
      severity: 'error',
      from: {
        path: '^src/app/runtime',
        pathNot: '^src/app/runtime/legacy-fallback\\.js$|^src/app/runtime-full\\.js$',
      },
      to: {
        path: '^src/app/full-page-app\\.js$',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: false,
    combinedDependencies: true,
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/[^/]+',
      },
    },
  },
};
