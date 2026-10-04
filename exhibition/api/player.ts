// Served at /_/player.js. Fixed, reviewed code: no exhibition ever supplies its own script.
// Without it the page still works: every video keeps native controls and each arrangement degrades to a plain layout.
export const PLAYER_JS = `(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js');
  var specimens = Array.prototype.slice.call(document.querySelectorAll('.specimen'));
  var coarse = window.matchMedia('(hover: none)').matches;

  function play(v, withSound) {
    v.muted = !withSound;
    var p = v.play();
    if (p && p.catch) {
      p.catch(function (e) {
        if (withSound && e && e.name === 'NotAllowedError') {
          v.muted = true;
          v.parentNode.classList.add('needs-sound');
          var q = v.play();
          if (q && q.catch) q.catch(function () {});
        }
      });
    }
  }

  var visible = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      var fig = en.target, v = fig.querySelector('video'), mode = fig.getAttribute('data-play');
      fig.classList.toggle('in', en.isIntersecting);
      if (mode === 'press') return;
      if (!en.isIntersecting) { v.pause(); return; }
      if (mode === 'loop') play(v, false);
      else if (mode === 'view') play(v, true);
    });
  }, { threshold: 0.5 });

  specimens.forEach(function (fig) {
    var v = fig.querySelector('video'), mode = fig.getAttribute('data-play');
    if (mode === 'press') return;
    v.removeAttribute('controls');
    v.loop = true;
    v.muted = mode !== 'view';
    visible.observe(fig);

    function focusOn() {
      fig.classList.add('focus');
      play(v, true);
    }
    function focusOff() {
      fig.classList.remove('focus', 'needs-sound');
      if (mode === 'hover') { v.pause(); v.currentTime = 0; }
      else if (mode === 'loop') v.muted = true;
    }
    if (coarse) {
      fig.addEventListener('click', function () {
        if (fig.classList.contains('focus')) focusOff(); else {
          specimens.forEach(function (o) { if (o !== fig && o.classList.contains('focus')) o.dispatchEvent(new Event('blur')); });
          focusOn();
        }
      });
      fig.addEventListener('blur', focusOff);
    } else {
      fig.addEventListener('mouseenter', focusOn);
      fig.addEventListener('mouseleave', focusOff);
      fig.addEventListener('click', function () { v.muted = !v.muted; fig.classList.remove('needs-sound'); });
    }
  });

  var corridor = document.querySelector('.corridor');
  if (corridor) {
    var track = corridor.querySelector('.track');
    var layout = function () {
      var run = Math.max(0, track.scrollWidth - window.innerWidth);
      corridor.style.height = (run + window.innerHeight) + 'px';
      scroll();
    };
    var scroll = function () {
      var top = corridor.getBoundingClientRect().top;
      var run = Math.max(0, track.scrollWidth - window.innerWidth);
      var p = Math.min(run, Math.max(0, -top));
      track.style.transform = 'translateX(' + (-p) + 'px)';
    };
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', layout);
    Array.prototype.forEach.call(track.querySelectorAll('video'), function (v) {
      v.addEventListener('loadedmetadata', layout);
    });
    layout();
  }
})();
`;
