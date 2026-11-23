// The textarea owns input, selection, undo and autosave. Replay is visual only.
(() => {
  const note = document.getElementById('note');
  const layer = document.getElementById('replay');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter() : null;
  let before, burst, timer, generation = 0;

  function clear() {
    clearTimeout(timer);
    generation++;
    layer.hidden = true;
    layer.replaceChildren();
  }
  function stop() {
    clear();
    before = burst = null;
  }
  function parts(text) {
    return segmenter ? Array.from(segmenter.segment(text), item => item.segment) : Array.from(text);
  }
  function draw(value, start, end, removing) {
    const changed = value.slice(start, end);
    if (!changed) return 0;
    const ink = document.createElement('span');
    ink.className = 'measure';
    ink.textContent = changed;
    layer.replaceChildren(value.slice(0, start), ink, value.slice(end), '\u200b');
    layer.style.width = note.clientWidth + 'px';
    layer.style.height = note.clientHeight + 'px';
    layer.hidden = false;
    layer.scrollTop = note.scrollTop;
    layer.scrollLeft = note.scrollLeft;
    const bounds = layer.getBoundingClientRect();
    // Only visible lines need individual glyphs, even for a full-page paste.
    const range = document.createRange();
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
    const stagger = Math.min(26, 430 / letters.length);
    const fragment = document.createDocumentFragment();
    letters.forEach((letter, index) => {
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
      const frames = [
        {opacity: 0, transform: 'translateY(2px) scale(.86)'},
        {opacity: 1, transform: 'translateY(-1px) scale(1.07)', offset: .67},
        {opacity: 1, transform: 'none'}
      ];
      glyph.animate(frames, {duration: 165, delay: (removing ? letters.length-1-index : index)*stagger,
        direction: removing ? 'reverse' : 'normal', fill: 'both', easing: 'ease-out'});
    });
    layer.append(fragment);
    return 165 + (letters.length-1)*stagger;
  }
  function play(edit) {
    const version = generation;
    const valid = () => version === generation && document.activeElement === note && note.value === edit.value && !reduced.matches;
    if (!valid()) return;
    const eraseTime = draw(edit.original, edit.start, edit.oldEnd, true);
    timer = setTimeout(() => {
      if (!valid()) { clear(); return; }
      const writeTime = draw(edit.value, edit.start, edit.end, false);
      timer = setTimeout(stop, writeTime);
    }, eraseTime);
  }
  note.addEventListener('beforeinput', () => {
    before = {value: note.value, start: note.selectionStart};
    clear();
  });
  note.addEventListener('input', event => {
    const old = before;
    before = null;
    if (!old || event.isComposing || reduced.matches || note.readOnly) { stop(); return; }
    const value = note.value;
    // Anchor the diff to the caret so repeated letters animate at the actual edit.
    let start = Math.min(old.start, note.selectionStart);
    if (old.value.slice(0,start) !== value.slice(0,start)) {
      const limit = start;
      start = 0;
      while (start < limit && old.value[start] === value[start]) start++;
    }
    let oldEnd = old.value.length, end = value.length;
    while (oldEnd > start && end > start && old.value[oldEnd-1] === value[end-1]) {oldEnd--; end--;}
    if (burst && burst.value === old.value && start >= burst.start && oldEnd <= burst.end) {
      burst.end += end-oldEnd;
      burst.value = value;
    } else if (burst && burst.value === old.value && oldEnd === burst.start && start < oldEnd && end === start) {
      burst.start = start;
      burst.end -= oldEnd-start;
      burst.value = value;
    } else {
      burst = {original: old.value, value, start, oldEnd, end};
    }
    timer = setTimeout(() => {
      const edit = burst;
      burst = null;
      if (edit) play(edit);
    }, 270);
  });
  for (const event of ['blur','scroll','pointerdown','compositionstart']) note.addEventListener(event, stop);
  note.addEventListener('keydown', event => {
    if (event.key.startsWith('Arrow') || ['Home','End','PageUp','PageDown'].includes(event.key)) stop();
  });
  window.addEventListener('resize', stop);
})();
