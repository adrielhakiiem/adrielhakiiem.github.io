/* a small attempt at understanding — charts and scrollytelling.
   data comes from data.js (window.CT), built by analysis/prepare_data.py. */
(function () {
  "use strict";
  const C = window.CT;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const T = reduced ? 0 : 700;
  const ink = "#ede6da", ink2 = "#b9b1a6", ink3 = "#8a837c", dim = "#2c2834", rose = "#e3b3bf", champagne = "#e6cfa4", bg = "#0d0c11";

  const FAM = {
    roar: { name: "the roar", color: "#bc3442", sym: d3.symbolTriangle,
      desc: "loud, dense and dark. the voice sits so deep in the mix that the model often hears no voice at all." },
    dusk: { name: "the dusk", color: "#18a7a1", sym: d3.symbolDiamond,
      desc: "energetic, but it never quite lifts. wistful more than dark, with the voice clear." },
    glow: { name: "the glow", color: "#cc7d1b", sym: d3.symbolCircle,
      desc: "the brightest this band sounds: energetic, more danceable, the voice up front." },
    hush: { name: "the hush", color: "#765dcf", sym: d3.symbolSquare,
      desc: "quiet, acoustic and spacious, with the lowest positivity of the four." },
  };
  const FAM_ORDER = ["roar", "dusk", "glow", "hush"];
  const FEAT = {
    energy: { label: "energy" },
    acousticness: { label: "acousticness" },
    valence: { label: "positivity" },
    instrumentalness: { label: "instrumentalness" },
    danceability: { label: "danceability" },
  };

  const lc = (s) => String(s).toLowerCase();
  const f2 = d3.format(".2f");
  const byId = new Map();
  C.tracks.forEach((t) => byId.set(t.id, t));
  C.extras.forEach((t) => byId.set(t.id, t));
  const albumIndex = new Map(C.albums.map((a, i) => [a.name, i]));
  const median = (k) => d3.median(C.tracks, (t) => t[k]);
  const MED = { energy: median("energy"), valence: median("valence"), acousticness: median("acousticness"),
    danceability: median("danceability"), instrumentalness: median("instrumentalness"), loudness: median("loudness") };

  // ---------------------------------------------------------------- tooltip
  const tip = document.getElementById("tip");
  function showTip(html, ev) {
    tip.innerHTML = html;
    tip.classList.add("is-on");
    const pad = 14, r = tip.getBoundingClientRect();
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
    tip.style.left = Math.max(8, x) + "px";
    tip.style.top = Math.max(8, y) + "px";
  }
  const hideTip = () => tip.classList.remove("is-on");
  addEventListener("scroll", hideTip, { passive: true });

  const songTip = (t, extra) =>
    `<b>${lc(t.title)}</b>${lc(t.album)} · ${t.year}${extra ? "<br>" + extra : ""}`;

  // re-render a chart when its box changes size
  function onResize(el, fn) {
    let w = 0, h = 0, raf;
    new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (Math.abs(r.width - w) < 2 && Math.abs(r.height - h) < 40) return;
      w = r.width; h = r.height;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fn);
    }).observe(el);
  }

  // ---------------------------------------------------------------- i. the 259 rows
  const units = (function () {
    const fig = document.getElementById("viz-units");
    const svg = d3.select(fig).append("svg");
    const legend = svg.append("g");
    const g = svg.append("g");
    const FATE = {
      studio: "one of the 85 album songs",
      copy: "another copy of an album",
      compdup: "an album song repeated on a compilation",
      extra: "only on a compilation",
    };
    // final grouping order for the last step
    const rank = { studio: 0, extra: 1, copy: 2, compdup: 2 };
    const rows = C.rows.map((r, i) => ({ ...r, i }));
    const sorted = rows.slice().sort((a, b) => rank[a.f] - rank[b.f] || a.i - b.i);
    sorted.forEach((r, j) => (r.j = j));
    let step = 0, cell = 10, cols = 20, W = 300;

    const states = [
      { fill: () => ink3, op: () => 0.75, legend: [[ink3, "259 rows"]] },
      { fill: (d) => (d.f === "studio" ? ink : dim), op: () => 1, legend: [[ink, "85 album songs"], [dim, "everything else"]] },
      { fill: (d) => (d.f === "studio" ? ink : d.f === "copy" ? rose : dim), op: (d) => (d.f === "studio" ? 0.45 : 1),
        legend: [[ink, "album songs"], [rose, "60 more copies of the same albums"]] },
      { fill: (d) => (d.f === "extra" ? champagne : d.f === "compdup" ? rose : d.f === "copy" ? rose : ink),
        op: (d) => (d.f === "studio" ? 0.3 : d.f === "copy" ? 0.3 : 1),
        legend: [[rose, "44 album songs, again, on compilations"], [champagne, "70 found only there"]] },
      { fill: (d) => (d.f === "studio" ? ink : d.f === "extra" ? champagne : dim), op: () => 1, sorted: true,
        legend: [[ink, "85 kept"], [champagne, "70 extras, kept apart"], [dim, "104 repeats set aside"]] },
    ];

    function pos(d) {
      if (!states[step].sorted) return [(d.i % cols) * cell, Math.floor(d.i / cols) * cell];
      // each group starts on a fresh row
      const starts = { 0: 0, 1: Math.ceil(85 / cols), 2: Math.ceil(85 / cols) + Math.ceil(70 / cols) };
      const grp = rank[d.f];
      const k = grp === 0 ? d.j : grp === 1 ? d.j - 85 : d.j - 155;
      return [(k % cols) * cell, (starts[grp] + Math.floor(k / cols)) * cell + grp * cell * 0.6];
    }

    function render() {
      W = fig.clientWidth;
      const Hmax = fig.clientHeight || 400;
      // choose the column count that fills the box best
      let best = 20;
      for (let c = 14; c <= 32; c++) {
        const s = Math.min(W / c, (Hmax - 50) / (Math.ceil(259 / c) + 4));
        if (s > Math.min(W / best, (Hmax - 50) / (Math.ceil(259 / best) + 4))) best = c;
      }
      cols = best;
      cell = Math.floor(Math.min(W / cols, (Hmax - 50) / (Math.ceil(259 / cols) + 4)));
      const gw = cols * cell;
      svg.attr("width", W).attr("height", (Math.ceil(259 / cols) + 4) * cell + 40);
      g.attr("transform", `translate(${(W - gw) / 2},40)`);
      legend.attr("transform", `translate(${(W - gw) / 2},12)`);
      update(true);
    }

    function update(instant) {
      const s = states[step];
      const sq = Math.max(3, cell - 2);
      const sel = g.selectAll("rect").data(rows, (d) => d.i).join((en) =>
        en.append("rect").attr("rx", 1.5)
          .on("pointerenter pointermove", (ev, d) => showTip(`<b>${lc(d.t)}</b>listed on ${lc(d.a)} (${d.y})<br>${FATE[d.f]}`, ev))
          .on("pointerleave", hideTip));
      sel.attr("width", sq).attr("height", sq);
      const tr = instant ? sel : sel.transition().duration(T).delay((d) => (s.sorted ? (d.j % 40) * 8 : 0));
      tr.attr("x", (d) => pos(d)[0]).attr("y", (d) => pos(d)[1]).attr("fill", s.fill).attr("opacity", s.op);
      // legend
      const items = legend.selectAll("g").data(s.legend, (d) => d[1]).join((en) => {
        const it = en.append("g").attr("opacity", 0);
        it.append("rect").attr("width", 9).attr("height", 9).attr("rx", 1.5).attr("y", -8);
        it.append("text").attr("class", "lbl").attr("x", 14);
        return it;
      });
      items.select("rect").attr("fill", (d) => d[0]).attr("stroke", (d) => (d[0] === dim ? ink3 : "none")).attr("stroke-width", 0.6);
      items.select("text").text((d) => d[1]);
      let x = 0;
      const maxW = cols * cell;
      let y = 0;
      items.each(function () {
        const w = this.getBBox().width + 18;
        if (x > 0 && x + w > maxW) { x = 0; y += 16; }
        d3.select(this).attr("transform", `translate(${x},${y - (s.legend.length > 2 && W < 520 ? 8 : 0)})`);
        x += w;
      });
      items.transition().duration(T / 2).attr("opacity", 1);
    }

    onResize(fig, render);
    render();
    return { step(i) { step = i; update(false); } };
  })();

  // ---------------------------------------------------------------- ii. same song, many copies
  (function copies() {
    const fig = document.getElementById("viz-copies");
    const plot = fig.querySelector(".viz__plot");
    const svg = d3.select(plot).append("svg");
    let metric = "energy";
    const groups = d3.groups(C.versions, (v) => v.album);

    function render() {
      const W = plot.clientWidth;
      const narrow = W < 560;
      const labW = narrow ? 118 : 220, rowH = narrow ? 26 : 26, headH = 34, top = 26;
      const iw = W - labW - 10;
      const nRows = C.versions.length;
      const H = top + nRows * rowH + groups.length * headH + 10;
      svg.attr("width", W).attr("height", H);
      const dom = metric === "energy" ? [0.2, 0.85] : [50, 200];
      const x = d3.scaleLinear(dom, [labW, labW + iw]);

      const ax = svg.selectAll("g.axis").data([0]).join("g").attr("class", "axis").attr("transform", `translate(0,${top - 8})`);
      ax.transition().duration(T).call(d3.axisTop(x).ticks(narrow ? 4 : 6).tickSize(0).tickPadding(4).tickFormat(metric === "energy" ? d3.format(".1f") : (d) => d + " bpm"));
      ax.select(".domain").remove();
      const gridSel = svg.selectAll("g.grid").data([0]).join("g").attr("class", "grid");
      gridSel.selectAll("line").data(x.ticks(narrow ? 4 : 6)).join("line")
        .attr("y1", top).attr("y2", H - 6).transition().duration(T).attr("x1", x).attr("x2", x);

      let yCur = top;
      const rows = [];
      const heads = [];
      groups.forEach(([album, vs]) => {
        heads.push({ album, y: yCur + 22 });
        yCur += headH;
        vs.forEach((v) => { rows.push({ v, y: yCur + rowH / 2 }); yCur += rowH; });
      });

      svg.selectAll("text.head").data(heads).join("text").attr("class", "head ann").attr("x", 0).attr("y", (d) => d.y)
        .text((d) => lc(d.album) + (d.album === "Four-Calendar Café" ? " · 1993" : " · 1996"));

      const row = svg.selectAll("g.row").data(rows, (d) => d.v.title).join((en) => {
        const g = en.append("g").attr("class", "row");
        g.append("text").attr("class", "lbl").attr("dy", "0.32em");
        g.append("line").attr("class", "span").attr("stroke", ink3).attr("stroke-opacity", 0.5);
        return g;
      }).attr("transform", (d) => `translate(0,${d.y})`);
      row.select("text").attr("x", 0).text((d) => {
        const t = lc(d.v.title);
        const max = narrow ? 16 : 30;
        return t.length > max ? t.slice(0, max - 1) + "…" : t;
      }).attr("fill", (d) => (metric === "tempo" && d.v.title === "Essence" ? ink : ink2));
      row.select("line.span").transition().duration(T)
        .attr("x1", (d) => x(d3.min(d.v.copies, (c) => c[metric]))).attr("x2", (d) => x(d3.max(d.v.copies, (c) => c[metric])));

      const order = { other: 0, odd: 1, chosen: 2 };
      row.selectAll("circle").data((d) => d.v.copies.slice().sort((a, b) => order[a.kind] - order[b.kind]), (c) => c.label)
        .join((en) => en.append("circle").attr("r", 0).attr("cx", (c) => x(c[metric]))
          .on("pointerenter pointermove", function (ev, c) {
            const v = d3.select(this.parentNode).datum().v;
            showTip(`<b>${lc(v.title)}</b>${lc(c.label)}<br>energy ${f2(c.energy)} · ${c.tempo} bpm · ${c.loudness.toFixed(1)} db`, ev);
          }).on("pointerleave", hideTip))
        .attr("fill", (c) => (c.kind === "chosen" ? bg : c.kind === "odd" ? rose : ink3))
        .attr("stroke", (c) => (c.kind === "chosen" ? ink : bg))
        .attr("stroke-width", (c) => (c.kind === "chosen" ? 2 : 1.5))
        .attr("fill-opacity", (c) => (c.kind === "other" ? 0.8 : 1))
        .transition().duration(T).attr("r", (c) => (c.kind === "other" ? 4.5 : 5.5)).attr("cx", (c) => x(c[metric]));

      // the essence callout
      const ess = rows.find((r) => r.v.title === "Essence");
      const ann = svg.selectAll("text.ess").data(metric === "tempo" ? [ess] : []).join((en) => en.append("text").attr("class", "ess ann halo").attr("opacity", 0));
      ann.attr("x", Math.min(labW + iw, x(150))).attr("y", (d) => d.y - 11).attr("text-anchor", "end").text("same song: 64, 100 and 140 bpm")
        .transition().duration(T).attr("opacity", 1);
    }

    fig.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      metric = b.dataset.metric;
      fig.querySelectorAll("button").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
      render();
    }));
    onResize(plot, render);
    render();
  })();

  // ---------------------------------------------------------------- iii. discography beeswarm
  const disco = (function () {
    const fig = document.getElementById("viz-disco");
    const ctr = d3.select(fig).append("div").attr("class", "viz__controls").attr("role", "group").attr("aria-label", "choose a measurement");
    const svg = d3.select(fig).append("svg");
    const gGrid = svg.append("g").attr("class", "grid"), gAx = svg.append("g").attr("class", "axis");
    const gRef = svg.append("g"), gLine = svg.append("g"), gDots = svg.append("g"), gMed = svg.append("g"), gAnn = svg.append("g"), gCov = svg.append("g");
    const title = svg.append("text").attr("class", "lbl lbl--strong");
    let feat = "energy", hi = null, annotate = [];
    const SHORT = { "The Moon and the Melodies": "the moon & the melodies", "Four-Calendar Café": "four-calendar café" };
    const STEPS = [
      { feat: "energy", hi: ["Garlands", "Head Over Heels"] },
      { feat: "energy", hi: ["Victorialand", "The Moon and the Melodies"] },
      { feat: "acousticness", hi: ["Victorialand", "The Moon and the Melodies"] },
      { feat: "valence", hi: ["Head Over Heels", "Four-Calendar Café", "Milk & Kisses"] },
      { feat: "instrumentalness", hi: ["Garlands", "Head Over Heels"], ann: ["Sugar Hiccup", "Blind Dumb Deaf"] },
      { feat: "instrumentalness", hi: null },
    ];
    const buttons = ctr.selectAll("button").data(Object.keys(FEAT)).join("button").attr("type", "button")
      .text((k) => FEAT[k].label)
      .on("click", (ev, k) => { feat = k; hi = null; annotate = []; update(); });

    let x, y, W, H, band, r, cov;
    const m = { t: 34, r: 8, b: 0, l: 34 };
    function layout() {
      W = fig.clientWidth;
      H = Math.max(300, fig.clientHeight - ctr.node().offsetHeight - 12);
      band = (W - m.l - m.r) / C.albums.length;
      cov = Math.min(56, band * 0.72);
      m.b = cov + (band > 78 ? 42 : 24);
      r = Math.max(2.6, Math.min(5.5, band / 15));
      x = (i) => m.l + band * (i + 0.5);
      y = d3.scaleLinear([0, 1], [H - m.b - 8, m.t + 6]);
      svg.attr("width", W).attr("height", H);
    }

    function swarm() {
      const nodes = C.tracks.map((t) => ({ t, x: x(albumIndex.get(t.album)), y: y(t[feat]) }));
      const sim = d3.forceSimulation(nodes)
        .force("x", d3.forceX((d) => x(albumIndex.get(d.t.album))).strength(0.12))
        .force("y", d3.forceY((d) => y(d.t[feat])).strength(1))
        .force("c", d3.forceCollide(r + 0.9)).stop();
      for (let i = 0; i < 160; i++) sim.tick();
      const lim = band * 0.46;
      nodes.forEach((n) => { const cx = x(albumIndex.get(n.t.album)); n.x = Math.max(cx - lim, Math.min(cx + lim, n.x)); });
      return nodes;
    }

    function update(instant) {
      buttons.attr("aria-pressed", (k) => String(k === feat));
      const isHi = (a) => !hi || hi.includes(a);
      title.attr("x", m.l).attr("y", 14).text(`${FEAT[feat].label} of every song · line = album median`);

      gAx.attr("transform", `translate(${m.l - 6},0)`).call(d3.axisLeft(y).ticks(4).tickSize(0).tickPadding(4)).select(".domain").remove();
      gGrid.selectAll("line").data(y.ticks(4)).join("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y).attr("y2", y);

      // 0.5 reference for instrumentalness
      const ref = gRef.selectAll("g").data(feat === "instrumentalness" ? [0.5] : []).join((en) => {
        const g = en.append("g");
        g.append("line").attr("stroke", rose).attr("stroke-opacity", 0.6);
        g.append("text").attr("class", "lbl halo").attr("fill", rose).attr("text-anchor", "end").attr("dy", -5);
        return g;
      });
      ref.select("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(0.5)).attr("y2", y(0.5));
      ref.select("text").attr("x", W - m.r).attr("y", y(0.5)).text("above: “probably no vocals”");

      const nodes = swarm();
      const dur = instant ? 0 : T;
      gDots.selectAll("circle").data(nodes, (d) => d.t.id).join((en) => en.append("circle").attr("cx", (d) => d.x).attr("cy", (d) => d.y)
        .on("pointerenter pointermove", (ev, d) => showTip(songTip(d.t, `${FEAT[feat].label} ${f2(d.t[feat])}`), ev))
        .on("pointerleave", hideTip))
        .attr("r", r)
        .transition().duration(dur).delay((d) => (instant ? 0 : albumIndex.get(d.t.album) * 25))
        .attr("cx", (d) => d.x).attr("cy", (d) => d.y)
        .attr("fill", (d) => (annotate.includes(d.t.title) ? rose : ink))
        .attr("fill-opacity", (d) => (isHi(d.t.album) ? 0.85 : 0.16));

      const meds = C.albums.map((a, i) => ({ a, i, v: a[feat] }));
      gLine.selectAll("path").data([meds]).join("path").attr("fill", "none").attr("stroke", rose).attr("stroke-width", 1.5).attr("stroke-opacity", 0.55)
        .transition().duration(dur).attr("d", d3.line((d) => x(d.i)).y((d) => y(d.v)).curve(d3.curveMonotoneX));
      gMed.selectAll("line").data(meds, (d) => d.a.name).join("line").attr("stroke-width", 2.5).attr("stroke-linecap", "round")
        .attr("x1", (d) => x(d.i) - band * 0.3).attr("x2", (d) => x(d.i) + band * 0.3)
        .transition().duration(dur).attr("y1", (d) => y(d.v)).attr("y2", (d) => y(d.v))
        .attr("stroke", (d) => (isHi(d.a.name) ? ink : ink3)).attr("stroke-opacity", (d) => (isHi(d.a.name) ? 1 : 0.4));
      // median value labels on highlighted albums
      gMed.selectAll("text").data(meds.filter((d) => hi && hi.includes(d.a.name)), (d) => d.a.name).join("text")
        .attr("class", "lbl lbl--strong halo").attr("text-anchor", "middle")
        .attr("x", (d) => x(d.i)).transition().duration(dur).attr("y", (d) => y(d.v) - 10).text((d) => f2(d.v));

      // song annotations
      const an = nodes.filter((n) => annotate.includes(n.t.title));
      gAnn.selectAll("text").data(an, (d) => d.t.id).join("text").attr("class", "ann halo")
        .attr("text-anchor", (d) => (d.x > W / 2 ? "end" : "start"))
        .attr("x", (d) => d.x + (d.x > W / 2 ? -10 : 10)).attr("y", (d, i) => d.y + (i ? 16 : -8)).text((d) => "“" + lc(d.t.title) + "”");

      // covers + names
      const cv = gCov.selectAll("g.cv").data(C.albums, (d) => d.name).join((en) => {
        const g = en.append("g").attr("class", "cv").style("cursor", "default")
          .on("pointerenter pointermove", (ev, a) => showTip(`<b>${lc(a.name)}</b>${a.year} · ${a.n} songs · ${a.minutes} min`, ev))
          .on("pointerleave", hideTip);
        g.append("rect").attr("fill", "#1d1a25");
        g.append("image").attr("preserveAspectRatio", "xMidYMid slice").attr("class", "cover")
          .on("error", function () { d3.select(this).remove(); });
        g.append("text").attr("class", "lbl yr").attr("text-anchor", "middle");
        g.append("text").attr("class", "lbl nm").attr("text-anchor", "middle");
        return g;
      });
      cv.attr("transform", (a, i) => `translate(${x(i) - cov / 2},${H - m.b + 6})`)
        .attr("opacity", (a) => (isHi(a.name) ? 1 : 0.35));
      cv.select("rect").attr("width", cov).attr("height", cov);
      cv.select("image").attr("href", (a) => a.cover).attr("width", cov).attr("height", cov);
      cv.select("text.yr").attr("x", cov / 2).attr("y", cov + 13).text((a) => (band > 78 ? "" : "’" + String(a.year).slice(2)));
      cv.select("text.nm").attr("x", cov / 2).attr("y", cov + 14).text((a) => (band > 78 ? lc(SHORT[a.name] || a.name) : ""))
        .call(wrap, band - 6);
    }

    function wrap(sel, width) {
      sel.each(function () {
        const t = d3.select(this), words = t.text().split(/\s+/).filter(Boolean);
        if (!words.length) return;
        const x0 = t.attr("x"), y0 = t.attr("y");
        t.text(null);
        let line = [], ts = t.append("tspan").attr("x", x0).attr("y", y0), n = 0;
        for (const w of words) {
          line.push(w); ts.text(line.join(" "));
          if (ts.node().getComputedTextLength() > width && line.length > 1) {
            line.pop(); ts.text(line.join(" ")); line = [w];
            ts = t.append("tspan").attr("x", x0).attr("y", +y0 + ++n * 12).text(w);
          }
        }
      });
    }

    function render() { layout(); update(true); }
    onResize(fig, render);
    render();

    // album medians table
    const tbl = d3.select("#table-albums").append("div").attr("class", "table-scroll").append("table");
    const cols = [["energy", "energy"], ["valence", "positivity"], ["acousticness", "acoustic"], ["danceability", "dance"], ["instrumentalness", "instr."], ["loudness", "db"]];
    tbl.append("thead").append("tr").selectAll("th").data(["album", "year", "songs", ...cols.map((c) => c[1])]).join("th").text((d) => d);
    tbl.append("tbody").selectAll("tr").data(C.albums).join("tr").selectAll("td")
      .data((a) => [lc(a.name), a.year, a.n, ...cols.map((c) => (c[0] === "loudness" ? a[c[0]].toFixed(1) : f2(a[c[0]])))]).join("td").text((d) => d);

    return { step(i) { const s = STEPS[i]; feat = s.feat; hi = s.hi; annotate = s.ann || []; update(); } };
  })();

  // ---------------------------------------------------------------- iv. energy vs positivity
  const scatter = (function () {
    const fig = document.getElementById("viz-scatter");
    const svg = d3.select(fig).append("svg");
    const gQ = svg.append("g"), gGrid = svg.append("g").attr("class", "grid"), gAx = svg.append("g"), gDots = svg.append("g"), gAnn = svg.append("g"), gHit = svg.append("g");
    let step = 0, x, y, S, ox, oy;
    const ANN = {
      2: ["In Our Angelhood"],
      3: ["Pitch the Baby", "A Kissed Out Red Floatboat", "Oomingmak"],
    };
    function render() {
      const W = fig.clientWidth, Hh = fig.clientHeight || W;
      S = Math.max(240, Math.min(W - 40, Hh - 70));
      ox = Math.max(30, (W - S) / 2 + 10); oy = 22;
      svg.attr("width", W).attr("height", S + oy + 44);
      x = d3.scaleLinear([0, 1], [ox, ox + S]);
      y = d3.scaleLinear([0, 1], [oy + S, oy]);
      gAx.selectAll("*").remove();
      gAx.append("g").attr("class", "axis").attr("transform", `translate(0,${oy + S + 6})`).call(d3.axisBottom(x).ticks(4).tickSize(0)).select(".domain").remove();
      gAx.append("g").attr("class", "axis").attr("transform", `translate(${ox - 6},0)`).call(d3.axisLeft(y).ticks(4).tickSize(0)).select(".domain").remove();
      gAx.append("text").attr("class", "lbl").attr("x", ox + S / 2).attr("y", oy + S + 36).attr("text-anchor", "middle").text("energy →");
      gAx.append("text").attr("class", "lbl").attr("transform", `translate(${ox - 34},${oy + S / 2}) rotate(-90)`).attr("text-anchor", "middle").text("positivity →");
      gGrid.selectAll("line").data([0, 0.25, 0.75, 1]).join("line").attr("x1", ox).attr("x2", ox + S).attr("y1", y).attr("y2", y);
      // hover layer
      const del = d3.Delaunay.from(C.tracks, (t) => x(t.energy), (t) => y(t.valence));
      gHit.selectAll("rect").data([0]).join("rect").attr("x", ox).attr("y", oy).attr("width", S).attr("height", S).attr("fill", "transparent")
        .on("pointermove", (ev) => {
          const [px, py] = d3.pointer(ev);
          const i = del.find(px, py), t = C.tracks[i];
          if (Math.hypot(x(t.energy) - px, y(t.valence) - py) > 28) return hideTip();
          showTip(songTip(t, `energy ${f2(t.energy)} · positivity ${f2(t.valence)}`), ev);
        }).on("pointerleave", hideTip);
      update(true);
    }
    function update(instant) {
      const dur = instant ? 0 : T;
      const q = step >= 1;
      const quads = [
        { x0: 0.5, y0: 0.5, label: "loud & bright", n: 21, ax: "end", ay: oy - 8 },
        { x0: 0.5, y0: 0, label: "loud & dark", n: 40, ax: "end", ay: oy + S + 36 },
        { x0: 0, y0: 0, label: "quiet & dark", n: 22, ax: "start", ay: oy + S + 36 },
        { x0: 0, y0: 0.5, label: "quiet & bright", n: 2, ax: "start", ay: oy - 8 },
      ];
      gQ.selectAll("rect").data(quads).join("rect")
        .attr("x", (d) => x(d.x0)).attr("y", (d) => y(d.y0 + 0.5)).attr("width", S / 2).attr("height", S / 2)
        .attr("fill", (d) => (d.label === "loud & dark" ? rose : ink)).transition().duration(dur)
        .attr("fill-opacity", (d) => (!q ? 0 : d.label === "loud & dark" ? (step === 1 || step === 4 ? 0.09 : 0.04) : 0.015));
      gQ.selectAll("line").data(q ? [0, 1] : []).join("line").attr("stroke", ink3).attr("stroke-opacity", 0.6)
        .attr("x1", (d) => (d ? x(0.5) : ox)).attr("x2", (d) => (d ? x(0.5) : ox + S))
        .attr("y1", (d) => (d ? oy : y(0.5))).attr("y2", (d) => (d ? oy + S : y(0.5)));
      gQ.selectAll("text").data(q ? quads : []).join("text").attr("class", "lbl halo")
        .attr("text-anchor", (d) => d.ax).attr("x", (d) => (d.ax === "end" ? ox + S : ox)).attr("y", (d) => d.ay)
        .attr("fill", (d) => (d.label === "loud & dark" ? rose : ink2))
        .text((d) => `${d.label} · ${d.n}`);

      const names = ANN[step] || [];
      const focusAlbum = step === 2 ? "Head Over Heels" : null;
      const on = (t) => (focusAlbum ? t.album === focusAlbum : names.length ? names.includes(t.title) : true);
      gDots.selectAll("circle").data(C.tracks, (t) => t.id).join((en) => en.append("circle").attr("r", 4.5).attr("stroke", bg).attr("stroke-width", 1.5))
        .attr("cx", (t) => x(t.energy)).attr("cy", (t) => y(t.valence))
        .transition().duration(dur)
        .attr("r", (t) => (names.includes(t.title) ? 6.5 : 4.5))
        .attr("fill", (t) => (names.includes(t.title) ? rose : ink))
        .attr("fill-opacity", (t) => (on(t) ? 0.9 : 0.18));
      const an = C.tracks.filter((t) => names.includes(t.title));
      gAnn.selectAll("text").data(an, (t) => t.id).join("text").attr("class", "ann halo")
        .attr("text-anchor", (t) => (t.energy > 0.6 ? "end" : "start"))
        .attr("x", (t) => x(t.energy) + (t.energy > 0.6 ? -11 : 11))
        .attr("y", (t, i) => y(t.valence) + 4 + (t.title === "A Kissed Out Red Floatboat" ? 16 : 0))
        .text((t) => "“" + lc(t.title) + "”");
      gAnn.selectAll("text.alb").data(focusAlbum ? [focusAlbum] : []).join("text").attr("class", "alb ann halo")
        .attr("x", x(0.85)).attr("y", y(0.32)).attr("text-anchor", "middle").attr("fill", rose).text("head over heels");
    }
    onResize(fig, render);
    render();
    return { step(i) { step = i; update(); } };
  })();

  // ---------------------------------------------------------------- v. families + map + explorer
  (function familyCards() {
    const wrap = d3.select("#family-cards");
    FAM_ORDER.forEach((k) => {
      const f = FAM[k], st = C.families[k];
      const albums = d3.rollups(C.tracks.filter((t) => t.family === k), (v) => v.length, (t) => t.album).sort((a, b) => b[1] - a[1]).slice(0, 2);
      const card = wrap.append("article").attr("class", "fam").style("--c", f.color);
      const h = card.append("h3").attr("class", "fam__name");
      const s = h.append("svg").attr("width", 16).attr("height", 16).attr("aria-hidden", "true");
      s.append("path").attr("d", d3.symbol(f.sym, 110)()).attr("transform", "translate(8,8.5)").attr("fill", f.color);
      h.append("span").text(f.name);
      card.append("p").attr("class", "fam__meta").text(`${st.n} songs · mostly ${albums.map((a) => lc(a[0])).join(" & ")}`);
      card.append("p").attr("class", "fam__desc").text(f.desc);
      const stats = card.append("div").attr("class", "fam__stats");
      [["energy", "energy"], ["valence", "positivity"], ["acousticness", "acoustic"]].forEach(([key, lab]) => {
        stats.append("span").text(lab);
        stats.append("span").attr("class", "fam__bar").append("i").style("width", st[key] * 100 + "%");
        stats.append("span").text(f2(st[key]));
      });
    });
  })();

  (function explorer() {
    const fig = document.getElementById("viz-map");
    const plot = fig.querySelector(".viz__plot");
    const svg = d3.select(plot).append("svg");
    const defs = svg.append("defs");
    defs.append("filter").attr("id", "blur").attr("x", "-100%").attr("y", "-100%").attr("width", "300%").attr("height", "300%")
      .append("feGaussianBlur").attr("stdDeviation", 16);
    const gHalo = svg.append("g").attr("filter", "url(#blur)"), gLink = svg.append("g"), gPts = svg.append("g"), gSel = svg.append("g");
    // legend: colour + shape per family, hollow = extra
    const leg = d3.select(fig).insert("div", ".viz__plot").attr("class", "viz__legend");
    FAM_ORDER.forEach((k) => {
      const it = leg.append("span");
      it.append("svg").attr("width", 12).attr("height", 12).attr("aria-hidden", "true").append("path")
        .attr("d", d3.symbol(FAM[k].sym, 70)()).attr("transform", "translate(6,6.5)").attr("fill", FAM[k].color);
      it.append("span").text(FAM[k].name);
    });
    const legX = leg.append("span").attr("class", "leg-extra").style("display", "none");
    legX.append("svg").attr("width", 12).attr("height", 12).attr("aria-hidden", "true").append("circle")
      .attr("cx", 6).attr("cy", 6).attr("r", 4).attr("fill", "none").attr("stroke", ink2).attr("stroke-width", 1.3);
    legX.append("span").text("hollow = extra");
    const extrasBox = document.getElementById("show-extras");
    const select = document.getElementById("song-select");
    const body = d3.select("#song-card .card__body");
    let showExtras = false, sel = C.tracks.find((t) => t.title === "Cherry-coloured Funk") || C.tracks[0];
    let x, y, W, H;

    // the picker: album songs by album, then the extras
    C.albums.forEach((a) => {
      const og = document.createElement("optgroup");
      og.label = `${lc(a.name)} (${a.year})`;
      C.tracks.filter((t) => t.album === a.name).forEach((t) => og.append(new Option(lc(t.title), t.id)));
      select.append(og);
    });
    const og = document.createElement("optgroup");
    og.label = "extras: eps, b-sides, sessions";
    C.extras.slice().sort((a, b) => a.title.localeCompare(b.title)).forEach((t) => og.append(new Option(lc(t.title), t.id)));
    select.append(og);

    const visible = () => (showExtras ? C.tracks.concat(C.extras) : C.tracks);

    function render() {
      W = plot.clientWidth; H = plot.clientHeight;
      svg.attr("width", W).attr("height", H);
      const all = C.tracks.concat(C.extras);
      const pad = Math.max(22, W * 0.06);
      x = d3.scaleLinear(d3.extent(all, (t) => t.x), [pad, W - pad]);
      y = d3.scaleLinear(d3.extent(all, (t) => t.y), [H - pad, pad]);
      draw(true);
    }

    function draw(instant) {
      const dur = instant ? 0 : T;
      const pts = visible();
      const nn = new Set(sel.nn);
      legX.style("display", showExtras ? null : "none");
      gHalo.selectAll("circle").data(C.tracks, (t) => t.id).join("circle").attr("r", Math.max(18, W / 26))
        .attr("fill", (t) => FAM[t.family].color).attr("fill-opacity", 0.22).attr("cx", (t) => x(t.x)).attr("cy", (t) => y(t.y));

      gPts.selectAll("path").data(pts, (t) => t.id).join(
        (en) => en.append("path").attr("opacity", 0).attr("transform", (t) => `translate(${x(t.x)},${y(t.y)})`),
        (up) => up,
        (ex) => ex.transition().duration(dur / 2).attr("opacity", 0).remove())
        .attr("d", (t) => d3.symbol(FAM[t.family].sym, t.kind === "extra" ? 34 : 62)())
        .attr("fill", (t) => (t.kind === "extra" ? "none" : FAM[t.family].color))
        .attr("stroke", (t) => (t.kind === "extra" ? FAM[t.family].color : bg))
        .attr("stroke-width", (t) => (t.kind === "extra" ? 1.3 : 1.5))
        .transition().duration(dur)
        .attr("transform", (t) => `translate(${x(t.x)},${y(t.y)})`)
        .attr("opacity", (t) => (t.id === sel.id || nn.has(t.id) ? 1 : 0.75));

      // links from the selected song to its nearest five
      const links = sel.nn.map((id) => byId.get(id));
      gLink.selectAll("line").data(links, (t) => t.id).join("line").attr("stroke", ink).attr("stroke-opacity", 0.45).attr("stroke-width", 1)
        .transition().duration(dur)
        .attr("x1", x(sel.x)).attr("y1", y(sel.y)).attr("x2", (t) => x(t.x)).attr("y2", (t) => y(t.y));
      const ring = gSel.selectAll("circle").data([sel, ...links], (t) => t.id).join("circle").attr("fill", "none")
        .attr("stroke", ink).attr("stroke-width", (t, i) => (i ? 1 : 2));
      ring.transition().duration(dur).attr("cx", (t) => x(t.x)).attr("cy", (t) => y(t.y)).attr("r", (t, i) => (i ? 8 : 12));
      gSel.selectAll("text").data([sel], (t) => t.id).join("text").attr("class", "ann halo")
        .attr("text-anchor", x(sel.x) > W * 0.6 ? "end" : "start")
        .attr("x", x(sel.x) + (x(sel.x) > W * 0.6 ? -18 : 18)).attr("y", y(sel.y) + 5).text("“" + lc(sel.title) + "”");

      // hover + tap, nearest point
      const del = d3.Delaunay.from(pts, (t) => x(t.x), (t) => y(t.y));
      svg.on("pointermove", (ev) => {
        const [px, py] = d3.pointer(ev), t = pts[del.find(px, py)];
        if (Math.hypot(x(t.x) - px, y(t.y) - py) > 26) { hideTip(); svg.style("cursor", "default"); return; }
        svg.style("cursor", "pointer");
        showTip(songTip(t, FAM[t.family].name + (t.kind === "extra" ? " · extra" : "")), ev);
      }).on("pointerleave", hideTip).on("click", (ev) => {
        const [px, py] = d3.pointer(ev), t = pts[del.find(px, py)];
        if (Math.hypot(x(t.x) - px, y(t.y) - py) <= 26) choose(t);
      });
    }

    function card() {
      const t = sel, f = FAM[t.family];
      select.value = t.id;
      body.html("");
      const top = body.append("div").attr("class", "song");
      top.append("img").attr("src", t.img).attr("alt", "").attr("loading", "lazy").on("error", function () { d3.select(this).attr("class", "noimg").attr("src", null); });
      const tx = top.append("div");
      tx.append("p").attr("class", "song__title").text(lc(t.title));
      tx.append("p").attr("class", "song__album").text(`${lc(t.album)} · ${t.year}${t.kind === "extra" ? " · extra" : ""}`);
      const chip = body.append("span").attr("class", "chip").style("--c", f.color);
      chip.append("i"); chip.append("span").text(f.name);

      const pr = body.append("div").attr("class", "prints");
      const rows = [["energy", "energy"], ["valence", "positivity"], ["acousticness", "acoustic"], ["danceability", "dance"], ["instrumentalness", "no-vocals"], ["loudness", "loudness"]];
      const sc = (k, v) => (k === "loudness" ? Math.max(0, Math.min(1, (v + 30) / 30)) : v);
      rows.forEach(([k, lab]) => {
        pr.append("span").text(lab);
        const tr = pr.append("span").attr("class", "track").style("--c", f.color);
        tr.append("i").style("width", "0%").transition().duration(T).style("width", sc(k, t[k]) * 100 + "%");
        tr.append("b").style("left", sc(k, MED[k]) * 100 + "%");
        pr.append("span").attr("class", "v").text(k === "loudness" ? Math.round(t[k]) + "db" : f2(t[k]));
      });
      pr.append("span").attr("class", "prints__key").text("| marks the median of all 85 album songs");

      body.append("p").attr("class", "near__head").text("closest in sound");
      const ul = body.append("ul").attr("class", "near");
      t.nn.forEach((id, i) => {
        const n = byId.get(id);
        const b = ul.append("li").append("button").attr("type", "button").style("--c", FAM[n.family].color).on("click", () => choose(n));
        b.append("i");
        const s = b.append("span"); s.append("span").text(lc(n.title)); s.append("small").text(`${lc(n.album)} · ${n.year}`);
        b.append("em").text("d " + t.nn_d[i].toFixed(2));
      });
      body.append("a").attr("class", "listen").attr("target", "_blank").attr("rel", "noopener")
        .attr("href", "https://open.spotify.com/search/" + encodeURIComponent(`${t.title} cocteau twins`)).text("listen on spotify ↗");
    }

    function choose(t) {
      sel = t;
      if (t.kind === "extra" && !showExtras) { showExtras = true; extrasBox.checked = true; }
      card(); draw();
    }
    select.addEventListener("change", () => choose(byId.get(select.value)));
    document.getElementById("shuffle").addEventListener("click", () => {
      const pool = visible().filter((t) => t.id !== sel.id);
      choose(pool[Math.floor(Math.random() * pool.length)]);
    });
    extrasBox.addEventListener("change", () => {
      showExtras = extrasBox.checked;
      if (!showExtras && sel.kind === "extra") sel = C.tracks[0];
      card(); draw();
    });
    onResize(plot, render);
    render(); card();
  })();

  // ---------------------------------------------------------------- scroll: progress, nav, steps
  const charts = { units, disco, scatter };
  const nav = document.querySelector(".top"), bar = document.getElementById("progress"), hero = document.querySelector(".hero");
  const scrollies = [...document.querySelectorAll(".scrolly")].map((el) => ({ el, steps: [...el.querySelectorAll(".step")], chart: charts[el.dataset.chart], cur: -1 }));
  let ticking = false;
  function onScroll() {
    ticking = false;
    const h = document.documentElement;
    bar.style.transform = `scaleX(${Math.min(1, h.scrollTop / (h.scrollHeight - innerHeight))})`;
    nav.classList.toggle("is-solid", hero.getBoundingClientRect().bottom < 60);
    const trigger = innerHeight * (innerWidth >= 960 ? 0.55 : 0.7);
    for (const s of scrollies) {
      let idx = 0;
      s.steps.forEach((st, i) => { if (st.getBoundingClientRect().top < trigger) idx = i; });
      if (idx !== s.cur) {
        s.cur = idx;
        s.steps.forEach((st, i) => st.classList.toggle("is-active", i === idx));
        s.chart.step(idx);
      }
    }
  }
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener("resize", onScroll);
  onScroll();
})();
