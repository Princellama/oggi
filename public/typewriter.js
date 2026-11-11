/* Oggi · the coaches' voice. London's and Roger's lines print out as if they're talking;
   a tap on the bubble shows the whole line at once. A line types again whenever a tab is opened
   (the pages call OggiSay.again()), not when the same tab redraws after a tap; people who ask for reduced motion get it whole straight away.
   The bubble keeps its full size from the start, so nothing below it jumps while it types. */
(function () {
  "use strict";
  const seen = new Set();
  const reduce = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
  // a beat after a full stop, a shorter one after a comma, otherwise a steady talking pace
  const pause = (ch) => (/[.!?]/.test(ch) ? 260 : /[,;:—]/.test(ch) ? 110 : 18);
  function say(text) {
    const box = document.createElement("span");
    box.className = "tw";
    if (typeof text !== "string") { box.append(text); return box; }
    const ghost = document.createElement("span"), live = document.createElement("span");
    ghost.className = "tw-ghost"; ghost.textContent = text; ghost.setAttribute("aria-hidden", "true");
    live.className = "tw-live";
    box.append(ghost, live);
    box.setAttribute("aria-label", text);
    if (reduce() || seen.has(text)) { live.textContent = text; box.classList.add("done"); return box; }
    seen.add(text);
    let i = 0, timer = null;
    const finish = () => { clearTimeout(timer); live.textContent = text; box.classList.add("done"); };
    const step = () => {
      if (box.classList.contains("done")) return;
      i = Math.min(text.length, i + (text[i] === " " ? 2 : 1));
      live.textContent = text.slice(0, i);
      if (i >= text.length) return finish();
      timer = setTimeout(step, pause(text[i - 1]));
    };
    timer = setTimeout(step, 250);
    box.finish = finish;
    return box;
  }
  // a tap anywhere on a bubble that is still typing shows the whole line
  document.addEventListener("click", (e) => {
    const bubble = e.target.closest && e.target.closest(".say");
    if (!bubble) return;
    const tw = bubble.querySelector(".tw:not(.done)");
    if (tw && tw.finish) tw.finish();
  });
  // opening a tab: let every line on it type again
  say.again = () => seen.clear();
  window.OggiSay = say;
})();
