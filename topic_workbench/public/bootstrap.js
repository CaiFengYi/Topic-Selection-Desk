const demo = new URLSearchParams(location.search).get('mode') === 'demo';
if (demo) document.title = '选题台 · 热点研究原型';
await import(demo ? './app.js' : './live.js');
