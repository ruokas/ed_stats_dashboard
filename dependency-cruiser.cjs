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
