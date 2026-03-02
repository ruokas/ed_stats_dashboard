(() => {
  const projectId = 'vofc979we9';
  if (!projectId) {
    return;
  }
  const existing = window.clarity;
  if (typeof existing === 'function') {
    return;
  }

  const queue = [];
  const clarity = (...args) => {
    queue.push(args);
  };
  clarity.q = queue;
  window.clarity = clarity;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${projectId}`;
  const firstScript = document.getElementsByTagName('script')[0];
  if (firstScript?.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
  } else {
    document.head.appendChild(script);
  }
})();
