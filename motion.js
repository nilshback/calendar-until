// The textarea owns input, selection, undo and autosave. Replay is visual only.
(() => {
  const note = document.getElementById('note');
  const layer = document.getElementById('replay');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter() : null;
  const done = document.getElementById('finishEdit');
  let before, original, latest, insertions;
  let frame, replayVersion = 0, playback, resolvePlayback, enterTimer;
  const viewport = window.visualViewport;
  let keyboardLow, keyboardWidth;

  function clear() {
    cancelAnimationFrame(frame);
    replayVersion++;
    layer.hidden = true;
    layer.replaceChildren();
    resolvePlayback?.();
    resolvePlayback = playback = null;
  }
  function parts(text) {
    return segmenter ? Array.from(segmenter.segment(text), item => item.segment) : Array.from(text);
  }
  function draw(value, ranges) {
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
    return glyphs.map((glyph,index) => {
      const frames = [
        {opacity: 0, transform: 'translateY(2px) scale(.86)'},
        {opacity: .6, transform: 'translateY(-1.5px) scale(1.07)', offset: .58},
        {opacity: 1, transform: 'none'}
      ];
      return glyph.animate(frames, {duration: 270, delay: index*stagger, fill: 'both', easing: 'ease-out'}).finished;
    });
  }
  function begin() {
    clear();
    original = latest = note.value;
    insertions = '0'.repeat(original.length);
    done.hidden = note.readOnly;
  }
  function finish(keepEditing = false) {
    clearTimeout(enterTimer);
    done.hidden = !keepEditing || note.readOnly;
    const mask = insertions;
    const changed = original !== latest && latest === note.value;
    const value = note.value;
    original = latest = value;
    insertions = keepEditing ? '0'.repeat(value.length) : null;
    before = null;
    if (!changed || !mask || reduced.matches) return playback;
    const added = Array.from(mask.matchAll(/1+/g), match => [match.index, match.index + match[0].length]);
    if (!added.some(([start, end]) => value.slice(start, end).trim())) return playback;
    clear();
    const version = replayVersion;
    playback = new Promise(resolve => { resolvePlayback = resolve; });
    frame = requestAnimationFrame(async () => {
      try {
        if (note.value === value && !document.getElementById('editor').hidden) {
          await Promise.allSettled(draw(value, added));
        }
      } finally {
        if (version === replayVersion) clear();
      }
    });
    return playback;
  }
  // The in-app back arrow waits for a visible replay before hiding the editor.
  window.finishNoteReplay = () => {
    note.blur();
    return finish();
  };
  note.addEventListener('focus', () => {
    begin();
    keyboardLow = viewport?.height;
    keyboardWidth = viewport?.width;
  });
  // Some phone keyboards dismiss without moving DOM focus.
  viewport?.addEventListener('resize', () => {
    if (document.activeElement !== note || !matchMedia('(pointer: coarse)').matches) return;
    if (viewport.width !== keyboardWidth) {
      keyboardWidth = viewport.width;
      keyboardLow = viewport.height;
    }
    keyboardLow = Math.min(keyboardLow, viewport.height);
    if (viewport.height - keyboardLow > 120) {
      keyboardLow = viewport.height;
      finish(true);
    }
  });
  function queueEnter() {
    clearTimeout(enterTimer);
    enterTimer = setTimeout(() => {
      if (document.activeElement === note) finish(true);
    }, 0);
  }
  note.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) queueEnter();
  });
  note.addEventListener('beforeinput', event => {
    if (!event.isComposing && ['insertLineBreak','insertParagraph'].includes(event.inputType)) queueEnter();
    if (insertions == null || latest !== note.value) begin();
    before = {value: note.value, start: note.selectionStart};
  });
  note.addEventListener('input', event => {
    if (playback) clear();
    if (insertions == null) return;
    // Some mobile keyboards deliver autocorrect or dictation as input alone.
    const old = before || {value: latest, start: note.selectionStart};
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
    if (!event.isComposing && (['insertLineBreak','insertParagraph'].includes(event.inputType) || event.data === '\n' || (!event.inputType && value.slice(start,end) === '\n'))) finish(true);
  });
  // Keep focus until click, including on browsers that blur on pointer down.
  done.addEventListener('pointerdown', event => event.preventDefault());
  done.addEventListener('click', () => { note.blur(); });
  note.addEventListener('blur', () => finish());
  // Dismissing a phone keyboard often resizes the viewport during playback.
  // Let the animation finish across height changes; rotation changes text wrapping.
  let layoutWidth = document.documentElement.clientWidth;
  window.addEventListener('resize', () => {
    const width = document.documentElement.clientWidth;
    if (width !== layoutWidth) clear();
    layoutWidth = width;
  });
  document.addEventListener('click', event => {
    if (event.target !== note && document.activeElement === note) note.blur();
  });
  window.addEventListener('popstate', clear);
})();
