// The textarea owns input, selection, undo and autosave. Replay is visual only.
(() => {
  const note = document.getElementById('note');
  const layer = document.getElementById('replay');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter() : null;
  const done = document.getElementById('finishEdit');
  let before, original, latest, insertions, timer;

  function clear() {
    clearTimeout(timer);
    layer.hidden = true;
    layer.replaceChildren();
  }
  function parts(text) {
    return segmenter ? Array.from(segmenter.segment(text), item => item.segment) : Array.from(text);
  }
  function draw(value, ranges) {
    if (!ranges.length) return 0;
    const marks = [];
    let last = 0;
    layer.replaceChildren();
    for (const [start, end] of ranges) {
      const ink = document.createElement('span');
      ink.className = 'measure';
      ink.textContent = value.slice(start, end);
      layer.append(value.slice(last, start), ink);
      marks.push(ink);
      last = end;
    }
    layer.append(value.slice(last), '\u200b');
    layer.style.width = note.clientWidth + 'px';
    layer.style.height = note.clientHeight + 'px';
    layer.hidden = false;
    layer.scrollTop = note.scrollTop;
    layer.scrollLeft = note.scrollLeft;
    const bounds = layer.getBoundingClientRect();
    // Only visible lines need individual glyphs, even for a full-page paste.
    const range = document.createRange();
    const fragment = document.createDocumentFragment();
    const glyphs = [];
    for (const ink of marks) {
      const changed = ink.textContent;
      function visibleEdge(edge, bottom) {
        let low = 0, high = changed.length;
        while (low < high) {
          const mid = Math.floor((low + high)/2);
          range.setStart(ink.firstChild, mid);
          range.setEnd(ink.firstChild, mid+1);
          const rect = range.getBoundingClientRect();
          if ((bottom ? rect.top : rect.bottom) < edge) low = mid+1;
          else high = mid;
        }
        return low;
      }
      let offset = visibleEdge(bounds.top, false);
      const letters = parts(changed.slice(offset, visibleEdge(bounds.bottom, true)));


      letters.forEach(letter => {
        range.setStart(ink.firstChild, offset);
        offset += letter.length;
        range.setEnd(ink.firstChild, offset);
        const rect = range.getBoundingClientRect();
        if (!letter.trim() || rect.bottom < bounds.top || rect.top > bounds.bottom) return;
        const glyph = document.createElement('span');
        glyph.className = 'ink';
        glyph.textContent = letter;
        glyph.style.left = rect.left - bounds.left + layer.scrollLeft + 'px';
        // Range rectangles measure the font box; center the line box on it.
        glyph.style.top = (rect.top + rect.bottom - parseFloat(getComputedStyle(layer).lineHeight))/2 - bounds.top + layer.scrollTop + 'px';
        fragment.append(glyph);
        glyphs.push(glyph);
      });
    }
    layer.append(fragment);
    const stagger = Math.min(40, 820 / Math.max(1,glyphs.length));
    glyphs.forEach((glyph,index) => {
      const frames = [
        {opacity: 0, transform: 'translateY(2px) scale(.86)'},
        {opacity: .6, transform: 'translateY(-1.5px) scale(1.07)', offset: .58},
        {opacity: 1, transform: 'none'}
      ];
      glyph.animate(frames, {duration: 270, delay: index*stagger, fill: 'both', easing: 'ease-out'});
    });
    return glyphs.length ? 270 + (glyphs.length-1)*stagger : 0;
  }
  function begin() {
    clear();
    original = latest = note.value;
    insertions = '0'.repeat(original.length);
    done.hidden = note.readOnly;
  }
  function finish() {
    done.hidden = true;
    const mask = insertions;
    insertions = before = null;
    if (!mask || reduced.matches || note.value !== latest || original === latest) return;
    // Each run of ones marks text added during this edit that still exists.
    const added = Array.from(mask.matchAll(/1+/g), match => [match.index, match.index + match[0].length]);
    if (added.length) timer = setTimeout(clear, draw(latest, added));
  }
  note.addEventListener('focus', begin);
  note.addEventListener('beforeinput', () => {
    if (insertions == null || latest !== note.value) begin();
    before = {value: note.value, start: note.selectionStart};
  });
  note.addEventListener('input', () => {
    if (!before || insertions == null) return;
    const old = before;
    before = null;
    const value = note.value;
    let start = Math.min(old.start, note.selectionStart);
    if (old.value.slice(0,start) !== value.slice(0,start)) {
      const limit = start;
      start = 0;
      while (start < limit && old.value[start] === value[start]) start++;
    }
    let oldEnd = old.value.length, end = value.length;
    while (oldEnd > start && end > start && old.value[oldEnd-1] === value[end-1]) {oldEnd--; end--;}
    insertions = insertions.slice(0,start) + '1'.repeat(end-start) + insertions.slice(oldEnd);
    latest = value;
  });
  // Keep focus until click, including on browsers that blur on pointer down.
  done.addEventListener('pointerdown', event => event.preventDefault());
  done.addEventListener('click', () => { note.blur(); });
  note.addEventListener('blur', finish);
  window.addEventListener('resize', clear);
  window.addEventListener('popstate', clear);
})();
