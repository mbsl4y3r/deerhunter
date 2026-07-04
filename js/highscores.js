window.DH = window.DH || {};

DH.highscores = (() => {
  const KEY = 'dh.highscores';
  const MAX = 10;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) { return []; }
  }

  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* private mode */ }
  }

  function qualifies(score) {
    if (score <= 0) return false;
    const list = load();
    return list.length < MAX || score > list[list.length - 1].score;
  }

  function add(initials, score) {
    const list = load();
    list.push({ initials, score, date: new Date().toISOString().slice(0, 10) });
    list.sort((a, b) => b.score - a.score);
    save(list.slice(0, MAX));
  }

  return { load, qualifies, add };
})();
