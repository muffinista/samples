// npx http-server -p 8000 --cors
// await import('http://localhost:8000/prebake.js')

// if we want to turn the bg entirely, but looks bad with busy hydra backgrounds and not needed if we raise the selection layer
// injectStyle('.code-container .cm-line>span { background: none !important; }'); 

// raise the selection altitude right below the cursor layer
injectStyle('.cm-layer.cm-selectionLayer { z-index: 149 !important; }'); 

// make selection easier to see, up the alpha if needed
injectStyle('.cm-layer.cm-selectionLayer .cm-selectionBackground { background-color: rgb(255 165 0 / 30%) !important; }'); 

// big fat cursor for shortsighted people
injectStyle('.cm-cursor.cm-cursor-primary   { animation: blink 1000ms intsfinite alternate; border-left: 5px solid white  !important; }');
injectStyle('.cm-cursor.cm-cursor-secondary { animation: blink 1000ms infinite alternate; border-left: 5px solid silver !important; }');


window.pk = function (...args) {
  const control = args.length > 2 ? args.pop() : 0
  return pick(args, control)
}



// https://tij.men/strudel/prebake.js
register('startFrom', (cycle, pat) => {
  return pat.late(cycle).filterWhen(t => t.gte(cycle))
})



/**
 * shift a pattern in time by amt. basically the same thing as 
 *
 *   off("0.25", x => x)
 *
 * but a little easier to type
 */
window.shiftBy = register('shiftBy', (amt, pat) => {
  return pat.late(amt);
});


// nudel fns
// apply lpf/hpf to everything:
// apf(4000, 800)
window.apf = (va, vb) => {
  if (vb === undefined) {
    return all((x) => x.lpf(va));
  }
  if (va === undefined) {
    return all((x) => x.hpf(vb));
  }
  return all((x) => x.lpf(va).hpf(vb));
};

window.alpf = (va) => {
  return all((x) => x.lpf(va));
};

window.ahpf = (va) => {
  return all((x) => x.lpf(va));
};


// https://codeberg.org/tyow/strudel/src/branch/main/prebakes/tyow.strudel

/*
 * These functions will function the same as degrade, but on a cycle basis 
 */
window.cycleDegradeBy = register('cycleDegradeBy', (by, pat) => {
  return pat
    .mask(wchooseCycles(["1", 1 - by], ["0", by]))
})

/**
 * Description
 * @param {any} 'cycleDegrade'
 * @param {any} pat=>{returnpat.mask("<[0|1]>"
 * @returns {any}
 */
window.cycleDegrade = register('cycleDegrade', pat => {
  return pat.mask("<[0|1]>")
})



// thanks hpunq
window.cycleCounter = () => {
  return note(time.seg("1").round())
    .postgain(0).dry(0).rsize(0).room(0)
    .pianoroll({ labels: 1, hideInactive: 1, vertical: 1, fillActive: 0, playheadColor: '#ffffff00', stroke: 0, playhead: 0, flipValues: 1 })
}


// https://codeberg.org/glossing/Strudel_Scripts/src/branch/main/scripts.mjs


/* Similar to set.mix but won't write over values that `vals` does not contain.
  This lets you do things like

  $: s("bd").n(5).room(0.1).rlp(1800).up(`<
    1 0.5 ~ 0.7:4
    1 0.5 ~ ~
    1 0.5 ~ [0.4:4 0.6:4]
    1 0.5 1:22:sd:1 ~
  >*8`.as("velocity:n:s:room"))

  to do Elektron-style parameter locks ++ set the rhythm of an element (similar to `struct`)
  at the same time
*/
window.up = register(
  'up',
  (vals, pat) =>
    pat
      .withValue(
        (v) => (vNew) =>
          Object.assign(v, Object.fromEntries(Object.entries(vNew).filter(([_, val]) => val !== undefined))),
      )
      .appBoth(vals),
  false,
);


/* Moves hits off the grid and adds velocity variation

@example
$: s("bd hh sd hh").humanize(slider(0.0328, 0, 1))
  .bank("tr909")
  ._pianoroll()
metronome: s("hh*8").n(9).dec(0.3)

*/
window.humanize = register('humanize', (amt, pat) => {
  const maxShift = clamp(amt, 0, 1) * 0.1;
  const query = (state) => {
    const span = state.span;
    return pat.query(state.setSpan(new TimeSpan(
      span.begin.sub(maxShift),
      span.end.add(maxShift)
    ))).map((hap) => {
      const t0 = Number(hap.part.begin);
      const offset = maxShift * (2 * getRandsAtTime(t0, 1, 0) - 1);
      const velocity = (hap.value.velocity ?? 1) + 0.5 * maxShift * (2 * getRandsAtTime(t0, 1, 1) - 1);
      const shifted = hap
        .withValue((v) => ({ ...v, velocity }))
        .withSpan((hapSpan) => hapSpan.withTime((t) => t.add(offset)));
      return new Hap(shifted.whole, shifted.part.intersection(span), shifted.value, shifted.context);
    });
  };
  return new Pattern(query).splitQueries();
});


window.currScale = "G#:minor";

// Set the global scale
window.setScale = (scaleName) => window.currScale = scaleName;

// Attach the global scale to the pattern (and shift the octave if provided)
// We use `ref` so scale changes later in the file still affect patterns above them
Pattern.prototype.sc = function (oct = 3) {
  return this.scale(ref(() => window.currScale)).trans(reify(oct).sub(3).mul(12));
}


// Don't like counting to 8? THEN THIS IS THE FUNCTION FOR YOU!
// It automatically turns patterns like n("0@3 4@4 2@2") into n("<0@3 4@4 2>*8") (meaning that
// it sets it to the correct metric subdivision (8th notes) _and_ truncates the 2@2 down to just 2 since that
// would spill past the measure)
/*
  @example
  $: n("0@3 4@4 2@2").meter(8).scale("F:minor")._pianoroll()
*/
window.meter = register('meter', (stepSize, pat) => {
  const total = pat._steps;
  stepSize = Fraction(stepSize);
  if (total.lt(stepSize)) {
    const pad = stepSize.sub(total);
    return stepcat(pat, gap(pad)).pace(stepSize).restart("1");
  }
  const remainder = total.mod(stepSize);
  const newSteps = total.sub(remainder);
  const numCycles = newSteps.div(stepSize);
  return pat.take(newSteps)
    .pace(stepSize)
    .restart(pure(1).slow(numCycles));
}, true, false, (x) => x.stepJoin());



// Get segmented rands
window.rands = (div) => rand.seg(div);



// Like postgain but faster to type & can be chained so that `pat.pg(0.5).pg(0.5)` will have overall
// postgain of 0.25
Pattern.prototype.pg = function (val) { return this.mul(postgain(val)); };


// Add a customizable riser. You are given access to `rise` which is a 0-1 variable
// that indicates progress towards the end of the rise
/*
  @example
  $: riser(16, 8, (x, rise) => x.s("supersaw").detune(rise))
*/
window.riser = (speed = 16, cycles = 16, callback = (x, _rise) => x) => {
  return saw
    .slow(cycles)
    .fmap((v) => v * v)
    .apply((rise) =>
      s('pulse')
        .seg(speed)
        .note(rise.mul(24))
        .add(note('F1'))
        .lpf(rise.range(50, 20000))
        .apply((x) => callback(x, rise)),
    );
};


// Acid filter
Pattern.prototype.acid = function (config = {}) {
  return this.FX(K(() => {
    const x = audioin();
    const f = S(config.cutoff ?? 0.3);
    const q = clamp(S(config.resonance ?? 0.8), 0, 1);
    const d = S(config.drive ?? 0);
    const e = S(config.env ?? 0.5);
    const dec = S(config.decay ?? 0.3);
    const envelope = impulse(1).ad(0.01, dec).mul(e);
    const fEnv = clamp(envelope.add(f), 0, 1);
    const norm = 2 / 3.14159265;
    const pre = atan(x.mul(1 + 4 * d)).mul(norm);
    const fb = pre.lpf(fEnv).lpf(fEnv).lpf(fEnv).lpf(fEnv).mul(q);
    const inp = pre.sub(fb);
    let y = inp.lpf(fEnv).lpf(fEnv).lpf(fEnv).lpf(fEnv);
    y = atan(y.mul(2.2)).mul(norm);
    return y.out();
  })).fxr(0.3);
};




// switchangel
// tb303 style filter envelope control between 0 & 1 values for useful range
register('acidenv', (x, pat) => pat.lpf(100)
                                   .lpenv(x * 9).lps(.2).lpd(.12).lpq(2)
);



register('trancegate', (density, seed, length, x) => {
  density = reify(density).add(.5)
  return x.struct(rand.mul(density).round().seg(16).rib(seed, length)).fill().clip(.7)
})


/* fill`, which is a function that's also used internally by
   `trancegate`. What it does is it takes a pattern of short notes with
   space between them, and stretches the notes out so there's no empty
   space between them anymore.  * * So it basically turns a pattern like
   `"1 - - 1 - 1 - - 1 - - -"` into `"1 _ _ 1 _ 1 _ _ 1 _ _ _"` * */
// fill in gaps between events
register('fill', function (pat) {
  return new Pattern(function (state) {
    const lookbothways = 1;
    // Expand the query window
    const haps = pat.query(state.withSpan(span => new TimeSpan(span.begin.sub(lookbothways), span.end.add(lookbothways))));
    const onsets = haps.map(hap => hap.whole.begin)
      // sort fractions
      .sort((a, b) => a.compare(b))
      // make unique
      .filter((x, i, arr) => i == (arr.length - 1) || x.ne(arr[i + 1]));
    const newHaps = [];
    for (const hap of haps) {
      // Ingore if the part starts after the original query
      if (hap.part.begin.gte(state.span.end)) {
        continue;
      }

      // Find the next onset, to use as an offset
      const next = onsets.find(onset => onset.gte(hap.whole.end));

      // Ignore if the part ended before the original query, and hasn't expanded inside
      if (next.lte(state.span.begin)) {
        continue;
      }

      const whole = new TimeSpan(hap.whole.begin, next);
      // Constrain part to original query
      const part = new TimeSpan(hap.part.begin.max(state.span.begin), next.min(state.span.end));
      newHaps.push(new Hap(whole, part, hap.value, hap.context, hap.stateful));
    }
    return newHaps;
  });
});

register('tgate', (amt, cycle, length, pat) => {
  amt = reify(amt)
  return pat.seg(16).degradeBy(amt.mul(-1).add(1))
            .rib(cycle,length).fill().clip(.7)
})


// quantize notes to given values: pat.grab("e:f#:c")
register('grab', function (scale, pat) {
  // Supports ':' list syntax in mininotation
  scale = (Array.isArray(scale) ? scale.flat() : [scale]).flatMap((val) =>
    typeof val === 'number' ? val : noteToMidi(val) - 48
  );

  return pat.withHap((hap) => {
    const isObject = typeof hap.value === 'object';
    let note = isObject ? hap.value.n : hap.value;
    if (typeof note === 'number') {
      note = note;
    }
    if (typeof note === 'string') {
      note = noteToMidi(note);
    }

    if (isObject) {
      delete hap.value.n; // remove n so it won't cause trouble
    }
    const octave = (note / 12) >> 0;
    const transpose = octave * 12;

    const goal = note - transpose;
    note =
      scale.reduce((prev, curr) => {
        return Math.abs(curr - goal) < Math.abs(prev - goal) ? curr : prev;
      }) + transpose;

    return hap.withValue(() => (isObject ? { ...hap.value, note } : note));
  });
});



// lpf between 0 and 1
register('rlpf', (x, pat) => { return pat.lpf(pure(x).mul(12).pow(4)) })

//hpf between 0 and 1
register('rhpf', (x, pat) => { return pat.hpf(pure(x).mul(12).pow(4)) })



register('fmtime', (start,length, pat) => {
  let modu = time.mod(length).add(start)
  return pat.fm(modu).fmh(modu)
})


register('acid', (pat) => {
  return pat.s('supersaw')
            .detune(.5)
            .unison(1)
            .lpf(100)
            .lpsustain(0.2).lpd(.2).lpenv(2)
            .lpq(12)
})


/* Polyphonic non-legato glide

This also has the nice feature of glide persisting across notes, so if you have a very long glide
it'll actually slowly drift between those targets rather than starting its glide over on
every new note

*/
register(
  'glide',
  (time, pat) => {
    let curr = [],
      prev = [],
      lastT = null;
    const query = (state) => {
      const trig = !!state.controls._cps; // an actual trigger as opposed to lookahead
      const haps = pat.query(state);
      const output = [];
      haps.map((hap) => {
        const { value, whole } = hap;
        const t = Number(whole.begin);
        if (trig && (lastT == null || lastT !== t)) {
          prev = curr;
          curr = [];
          lastT = t;
        }
        const glideHaps = time.query(state.setSpan(hap.wholeOrPart()));
        glideHaps.map((glideHap) => {
          const part = hap.part.intersection(glideHap.part);
          if (!part) return;
          const context = hap.combineContext(glideHap);
          const glideT = glideHap.value;
          const freqF = getFrequencyFromValue(value, value.s === 'sbd' ? 29 : 36); // target
          const freqI = prev.length
            ? prev.reduce((closest, v) => {
                const phase = glideT > 0 ? Math.min((t - v.t) / glideT, 1) : 1;
                const cand = v.freqI + phase * (v.freqF - v.freqI);
                if (closest == null) return cand;
                return Math.abs(cand - freqF) < Math.abs(closest - freqF) ? cand : closest;
              }, null)
            : freqF;
          if (trig) {
            curr.push({ freqI, freqF, t });
          }
          let newVal = value;
          if (Math.abs(freqF - freqI) > 1e-6) {
            newVal = {
              ...value,
              panchor: 0,
              psustain: 0,
              pattack: 0,
              pdecay: glideT,
              penv: -12 * Math.log2(freqF / freqI),
            };
          }
          output.push(new Hap(whole, part, newVal, context));
        });
      });
      return output;
    };
    return new Pattern(query);
  },
  false,
);




/**
 * borrowing glossingg hotkey code and
 * greatly simplifying
 */
if (!window.__hotkeysAreSet) {
  const repl = window.strudelMirror;
  window.addEventListener('keydown', async (event) => {
    if (event.repeat) return;
    const meta = event.metaKey;
    const shift = event.shiftKey;
    window.anonIdx ??= 0;
    // CMD + SHIFT + . = insert one-line 8th note wrapper
    if (meta && shift && event.key === '.') {
      event.preventDefault();
      const x = repl.getCursorLocation();
      repl.insertCode('"<>*8"', x);
      repl.setCursorLocation(x + 2);
    }
    // CMD + SHIFT + , = insert multi-line 8th note wrapper
    if (meta && shift && event.key === ',') {
      event.preventDefault();
      const x = repl.getCursorLocation();
      repl.insertCode('\`<\n  \n>*8\`', x);
      repl.setCursorLocation(x + 5);
    }
    // CMD + SHIFT + c = count # of events highlighted
    if (meta && shift && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      const selection = repl.editor.state.selection.main;
      const selected = repl.editor.state.doc.sliceString(selection.from, selection.to).trim();
      const parts = selected.split(/\s+/).filter(Boolean);
      alert('Count: ' + parts.length);
    }
    // CMD + SHIFT + / = insert 16 rests
    if (meta && shift && event.key === '/') {
      event.preventDefault();
      const x = repl.getCursorLocation();
      repl.insertCode('~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~', x);
      repl.setCursorLocation(x + 31);
    }
  });
}
window.__hotkeysAreSet = true;



// https://cdn.jsdelivr.net/gh/natecdr/sounds@main/prebake.js
register('print_haps', function (pat) {
  const haps = pat.queryArc(0, 1);
  console.log(haps.map((e) => e.show()));
  return pat;
});

// https://codeberg.org/tyow/strudel/src/branch/main/prebakes/tyow.strudel
/**
 * If given pattern is in a true state, applies function 1, otherwise applies function 2
 * @tags temporal
 * @name whenElse
 * @memberof Pattern
 * @param {Pattern} binary_pat
 * @param {function} func 1
 * @param {function} func 2
 * @returns Pattern
 * @example
 * "c3 eb3 g3"
   .whenElse("<0 1>/2", x=>x.sub("5"), x=>x.add("5"))
   .note()
 */
window.whenElse = register('whenElse', function (on, func1, func2, pat) {
  return on ? func1(pat) : func2(pat)
})
